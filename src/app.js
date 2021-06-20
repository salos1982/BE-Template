const express = require('express');
const bodyParser = require('body-parser');
require('express-async-errors');
const {sequelize} = require('./model')
const Sequelize = require('sequelize');
const { ne, or, gte, between, in: opIn } = Sequelize.Op;
const {getProfile} = require('./middleware/getProfile')

const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const profileId = req.profile.id;

    const contract = await Contract.findOne({where: {id}})
    if(!contract) return res.status(404).end()

    if (contract.ContractorId !== profileId) {
        return res.status(403).end();
    }
    res.json(contract)
})

app.get('/contracts',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models');
    const profileId = req.profile.id;

    const contracts = await Contract.findAll({where: { ContractorId: profileId, status: { [ne]: 'terminated'} }});
    res.json(contracts);
})

app.get('/jobs/unpaid',getProfile ,async (req, res) =>{
    const {Job, Contract} = req.app.get('models');
    const profileId = req.profile.id;

    const jobs = await Job.findAll({
        include: [{ model: Contract, required: true}],
        where: {
            [or]: [
                { '$Contract.ContractorId$': profileId },
                { '$Contract.ClientId$': profileId },
            ],
            paid: null,
        }
    })
    jobs.forEach(item => delete item.Contract);
    res.json(jobs);
})

app.post('/jobs/:job_id/pay',getProfile ,async (req, res) =>{
    const {Job, Contract, Profile} = req.app.get('models');
    const {job_id} = req.params;
    const profileId = req.profile.id;

    const job = await Job.findOne({
        include: [{ model: Contract, required: true, 
            include: [
                { model: Profile, required: true, as: 'Client', required: true},
                { model: Profile, required: true, as: 'Contractor', required: true }
            ]
        }],
        where: {
            paid: null,
            id: job_id,
            '$Contract->Client.id$': profileId,
            '$Contract->Client.balance$': { [gte]: sequelize.col('price')},
            '$Contract.status$': { [ne]: 'terminated'},
        }
    })

    if (!job) {
        return res.status(400).end();
    }

    let transaction;
    try {
        transaction = await sequelize.transaction();
        const [ affectedClientModel ] = await Profile.increment(
            { balance: -job.price},
            {
                where: {
                    id: profileId,
                    balance: {
                        [gte]: job.price
                    },
                },
                transaction,
            }
        );
        
        if (affectedClientModel[1] !== 1) {
            // balance changed between this call and previous call
            transaction.rollback();
            return res.status(400).end();
        }

        const [affectContractorModel] = await Profile.increment(
            { balance: job.price},
            {
                where: {
                    id: job.Contract.ContractorId,
                },
                transaction,
            }
        )
        if (affectContractorModel[1] !== 1) {
            transaction.rollback();
            return res.status(400).end();
        }

        transaction.commit();
      } catch(err) {
        if (transaction) {
            transaction.rollback();
        }
        
        console.error(err);
      }
    
    res.json(true);
})

/**
 * I didn't understand meaning for field userId and absence of field money (or any other name about amount of money to deposit)
 * So i decided that it is error and userId should be replaced with money
 * Also, I do not understand why client could not deposit more than 25% of his active jobs so I might be mistaken
 */

app.post('/balances/deposit/:money', getProfile, async (req, res) => {
    const { money } = req.params;
    const {Job,Contract, Profile} = req.app.get('models');
    const profileId = req.profile.id;

    if (money <= 0) {
        return res.status(400).send('nonpositive number are not possible');
    }

    const contracts = await Contract.findAll({
        where: {
            ClientId: profileId,
            status: 'in_progress',
        },
        attributes: ['id'],
    });
    const contractIds = contracts.map(item => item.id);
    const sumForCurrentJobs = await Job.aggregate('price', 'sum', {
        where: {
            ContractId: {
                [opIn]: contractIds,
            },
            paid: null,
        }
    });
    if (money > 0.25 * sumForCurrentJobs ) {
        return res.status(400).send('too big deposit')
    }

    await Profile.increment(
        {balance: money},
        {
            where: {
                id: profileId,
            }
        }
    )

    res.json(true);
})

app.get('/admin/best-profession', getProfile, async (req, res) => {
    const {start, end} = req.query;
    const startDate = Date.parse(start);
    const endDate = Date.parse(end);

    const {Job, Contract, Profile} = req.app.get('models');

    const professionsData = await Job.findAll({
        include: [{ model: Contract, required: true, 
            include: [
                { model: Profile, required: true, as: 'Contractor', required: true }
            ]
        }],
        attributes: [
            'Contract->Contractor.profession',
            [sequelize.fn('sum', sequelize.col('price')), 'total_earned'],
        ],
        group: ['Contract->Contractor.profession'],
        where: {
            paid: true,
            paymentDate: { [between]: [startDate, endDate]},
        },
        order: [[sequelize.col('total_earned'), 'DESC']],
    })
    const professions = professionsData.map(item => item.Contract.Contractor.profession);
    res.json(professions);
})

app.get('/admin/best-clients', getProfile, async (req, res) => {
    const {start, end, limit = 2} = req.query;
    const startDate = Date.parse(start);
    const endDate = Date.parse(end);

    const {Job, Contract, Profile} = req.app.get('models');

    const clientsData = await Job.findAll({
        include: [{ model: Contract, required: true, 
            include: [
                { model: Profile, required: true, as: 'Client', required: true }
            ]
        }],
        attributes: [
            'Contract->Client.id',
            'Contract->Client.firstName',
            'Contract->Client.lastName',
              [sequelize.fn('sum', sequelize.col('price')), 'total_spend'],
        ],
        group: ['Contract->Client.id'],
        where: {
            paid: true,
            paymentDate: { [between]: [startDate, endDate]},
        },
        order: [[sequelize.col('total_spend'), 'DESC']],
        limit,
    })
    const clients = clientsData.map(item => ({
        id: item.Contract.Client.id,
        fullName: item.Contract.Client.firstName + ' ' + item.Contract.Client.lastName,
        paid: item.dataValues.total_spend,
    }));
    res.json(clients);
})

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500);
    res.json({ error: err.message });
    next(err);
  });

module.exports = app;
