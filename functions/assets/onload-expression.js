; (function () {
  const apiKey = window._pagarmeKey
  const storeId = window.storefront && window.storefront.settings && window.storefront.settings.store_id 
  window._pagarmeHash = async function (cardClient) {
    return new Promise(async function (resolve, reject) {
      const card = {
        number: cardClient.number,
        holder_name: cardClient.name,
        exp_month: cardClient.month,
        exp_year: cardClient.year,
        cvv: cardClient.cvc
      }

      fetch(
        `https://api.pagar.me/core/v5/tokens?appId=${apiKey}`,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'POST',
          body: JSON.stringify({
            type: 'card',
            card
          })
        }
      )
        .then(resp => resp.json())
        .then(data => {
          if (data.id) {
            resolve(data.id)
          }
          throw new Error('Credencial inválida')
        })
        .catch(err=> {
          console.log('credencial inválida', err)
          reject(err)
        })
    })
  }
}())
