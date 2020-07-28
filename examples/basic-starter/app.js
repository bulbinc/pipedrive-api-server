'use strict'
require('dotenv').config()

const pipedrive = require('pipedrive')
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const compression = require('compression')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const app = express()
const router = express.Router()

app.set('view engine', 'pug')

pipedrive.Configuration.apiToken = process.env.PIPEDRIVE_API_TOKEN;

if (process.env.NODE_ENV === 'test') {
  // NOTE: aws-serverless-express uses this app for its integration tests
  // and only applies compression to the /sam endpoint during testing.
  router.use('/sam', compression())
} else {
  router.use(compression())
}

router.use(cors())
router.use(bodyParser.json())
router.use(bodyParser.urlencoded({ extended: true }))
router.use(awsServerlessExpressMiddleware.eventContext())

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to Bulb Pipedrive API' })
})

// start pipedrive
router.options('*', cors())

router.post('/contact', cors(), async (req, res, next) => {
  let person;
  try {
    const { name, email, phone } = req.body;
    const personInput = {
      body: {
        name,
        email: [email],
        phone: [phone],
      }
    };
    const { data } = await pipedrive.PersonsController.addAPerson(personInput);
    person = data;
  } catch (error) {
    next(error);
  }

  let organization;
  try {
    const { organization_name } = req.body;
    const organizationInput = {
      body: {
        name: organization_name
      }
    };

    const { data } = await pipedrive.OrganizationsController.addAnOrganization(organizationInput);
    organization = data;
  } catch (error) {
    next(error);
  }

  let deal;
  try {
    const { title, budget } = req.body;
    const dealInput = {
      body: {
        title,
        value: budget,
        person_id: person.id,
        org_id: organization.id,
      }
    };

    const { data } = await pipedrive.DealsController.addADeal(dealInput);
    deal = data;
  } catch (error) {
    next(error);
  }

  let note;
  try {
    const { contact_body } = req.body;
    const noteInput = {
      content: contact_body,
      dealId: deal.id,
      personId: person.id,
    };
    const { data } = await pipedrive.NotesController.addANote(noteInput);
    note = data;
  } catch (error) {
    next(error);
  }

  res.send({ message: 'success!' });
});
// end pipedrive

// The aws-serverless-express library creates a server and listens on a Unix
// Domain Socket for you, so you can remove the usual call to app.listen.
// app.listen(3000)
app.use('/', router)

function errorHandler(err, req, res, next) {
  // console.log('errorHandler', err);
  res.status(err.errorCode || 500);
  res.send({ error: err })
}

app.use(errorHandler)

// Export your express server so you can import it in the lambda function.
module.exports = app
