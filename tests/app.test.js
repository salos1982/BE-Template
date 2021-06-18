const request = require('supertest');
const app = require('../src/app');

describe('get contract test', () => {
  it('contract with accessable profile', async () => {
    await request(app)
      .get('/contracts/1')
      .set('profile_id', '5')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        expect(response.body.id).toBe(1);
        expect(response.body.ContractorId).toBe(5);
      })
  })

  it('contract with not accessable profile', async () => {
    await request(app)
      .get('/contracts/1')
      .set('profile_id', '1')
      .set('Accept', 'application/json')
      .expect(403)
  })
});

describe('get contracts', () => {
  it('get multiple contacts', async () => {
    await request(app)
    .get('/contracts')
    .set('profile_id', '6')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toIncludeSameMembers([
        expect.objectContaining({
          id: 2,
          ClientId: 1,
          ContractorId: 6,
        }),
        expect.objectContaining({
          id: 3,
          ClientId: 2,
          ContractorId: 6,
        }),
        expect.objectContaining({
          id: 8,
          ClientId: 4,
          ContractorId: 6,
        }),
      ])
    })
  })

  it('get no contacts', async () => {
    await request(app)
    .get('/contracts')
    .set('profile_id', '1')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toBeArrayOfSize(0);
    })
  })

  it('get contacts with terminated contract', async () => {
    await request(app)
    .get('/contracts')
    .set('profile_id', '5')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toBeArrayOfSize(0);
    })
  })
});

describe('get unpaid jobs', () => {
  it('get unpaid jobs for active clients', async () => {
    await request(app)
    .get('/jobs/unpaid')
    .set('profile_id', '2')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toIncludeSameMembers([
        expect.objectContaining({
          id: 4,
          paid: null,
        }),
        expect.objectContaining({
          id: 3,
          paid: null,
        }),
      ]);
    })
  })

  it('get unpaid jobs for active contractors', async () => {
    await request(app)
    .get('/jobs/unpaid')
    .set('profile_id', '7')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toIncludeSameMembers([
        expect.objectContaining({
          id: 4,
          paid: null,
        }),
        expect.objectContaining({
          id: 5,
          paid: null,
        }),
      ]);
    })
  })
});

describe('pay for job', () => {
  it('pay for job for terminated contract', async () => {
    await request(app)
    .post('/jobs/1/pay')
    .set('profile_id', '1')
    .set('Accept', 'application/json')
    .expect(400)
  })

  it('pay for job that already paid', async () => {
    await request(app)
    .post('/jobs/7/pay')
    .set('profile_id', '1')
    .set('Accept', 'application/json')
    .expect(400)
  })

  it('pay for job that is not job client', async () => {
    await request(app)
    .post('/jobs/2/pay')
    .set('profile_id', '2')
    .set('Accept', 'application/json')
    .expect(400)
  })

  it('pay for job success', async () => {
    await request(app)
    .post('/jobs/2/pay')
    .set('profile_id', '1')
    .set('Accept', 'application/json')
    .expect(200)
  })

  it('pay for job withhout enough money', async () => {
    await request(app)
    .post('/jobs/5/pay')
    .set('profile_id', '4')
    .set('Accept', 'application/json')
    .expect(400)
  })

  it('pay for job for wrong job id', async () => {
    await request(app)
    .post('/jobs/111/pay')
    .set('profile_id', '1')
    .set('Accept', 'application/json')
    .expect(400)
  })
});

describe('get best professions', () => {
  it('get best profession for correct period', async () => {
    await request(app)
    .get('/admin/best-profession')
    .query({ start: '2020-08-15', end: '2020-08-18'})
    .set('profile_id', '4')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toIncludeSameMembers(['Programmer', 'Musician', 'Fighter']);
    })
  })

  it('get best profession for period without jobs', async () => {
    await request(app)
    .get('/admin/best-profession')
    .query({ start: '2020-08-18', end: '2020-08-20'})
    .set('profile_id', '4')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toBeArrayOfSize(0);
    })
  })
})

describe('get best clients', () => {
  it('get best clients for correct period without limit', async () => {
    await request(app)
    .get('/admin/best-clients')
    .query({ start: '2020-08-15', end: '2020-08-18'})
    .set('profile_id', '4')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toEqual([
        { id: 4, fullName: 'Ash Kethcum', paid: 2020 },
        { id: 1, fullName: 'Harry Potter', paid: 421 },
      ]);
    })
  })

  it('get best clients for correct period with limit', async () => {
    await request(app)
    .get('/admin/best-clients')
    .query({ start: '2020-08-15', end: '2020-08-18', limit: 4})
    .set('profile_id', '4')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(response => {
      expect(response.body).toEqual([
        { id: 4, fullName: 'Ash Kethcum', paid: 2020 },
        { id: 1, fullName: 'Harry Potter', paid: 421 },
        { id: 2, fullName: 'Mr Robot', paid: 321 },
        { id: 3, fullName: 'John Snow', paid: 200 }
      ]);
    })
  })
})