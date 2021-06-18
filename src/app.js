const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const Sequelize = require('sequelize');
const { ne, or, gte, between } = Sequelize.Op;
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
    const contract = await Contract.findOne({where: {id}})
    if(!contract) return res.status(404).end()

    if (contract.ContractorId !== req.profile.id) {
        return res.status(403).end();
    }
    res.json(contract)
})

app.get('/contracts',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models');
    const contracts = await Contract.findAll({where: { ContractorId: req.profile.id, status: { [ne]: 'terminated'} }});
    res.json(contracts);
})

app.get('/jobs/unpaid',getProfile ,async (req, res) =>{
    const {Job, Contract} = req.app.get('models');
    const jobs = await Job.findAll({
        include: [{ model: Contract, required: true}],
        where: {
            [or]: [
                { '$Contract.ContractorId$': req.profile.id },
                { '$Contract.ClientId$': req.profile.id },
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
            '$Contract->Client.id$': req.profile.id,
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
                    id: req.profile.id,
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

module.exports = app;
