'use strict'
require('dotenv').config()

const pipedrive = require('pipedrive')
const { IncomingWebhook } = require('@slack/webhook')
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const compression = require('compression')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const app = express()
const router = express.Router()

// slack webhook
const url = process.env.SLACK_WEBHOOK_URL
const webhook = new IncomingWebhook(url)

app.set('view engine', 'pug')

pipedrive.Configuration.apiToken = process.env.PIPEDRIVE_API_TOKEN;

function getSuccessResultText(req) {
  const {
    name,
    email,
    phone,
    organization_name,
    budget,
    contact_body
  } = req.body

  return `
新規問い合わせ
--------------------------------------
名前: ${name}
メールアドレス: ${email}
電話番号: ${phone}
会社名: ${organization_name}
予算: ${budget}
問い合わせ内容:
${contact_body}
`
}

function getErrorResultText(req) {
  const {
    name,
    email,
    phone,
    organization_name,
    budget,
    contact_body
  } = req.body

  return `
PIPEDRIVE API SERVERでエラーが発生しました
--------------------------------------
以下送信内容

名前: ${name}
メールアドレス: ${email}
電話番号: ${phone}
会社名: ${organization_name}
予算: ${budget}
問い合わせ内容:
${contact_body}
`
}

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
    const { data } = await pipedrive.PersonsController.addAPerson({});
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

  try {
    await webhook.send({
      text: getSuccessResultText(req)
    });
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

  webhook.send({
    text: getErrorResultText(req)
  });
}

app.use(errorHandler)

// Export your express server so you can import it in the lambda function.
module.exports = app
