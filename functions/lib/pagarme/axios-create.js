const axios = require('axios')

module.exports = (apiSecretKey) => {
  return axios.create({
    baseURL: 'https://api.pagar.me/core/v5',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${apiSecretKey}:`).toString('base64')
    }
  })
}
