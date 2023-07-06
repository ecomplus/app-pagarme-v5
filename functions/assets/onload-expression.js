; (function () {
  const apiKey = window._pagarmeKey
  window._pagarmeHash = async function (cardClient) {
    return new Promise(async function (resolve, reject) {
      const card = {
        number: cardClient.number,
        holder_name: cardClient.name,
        exp_month: cardClient.month,
        exp_year: cardClient.year,
        cvv: cardClient.cvc
      }
      const resp = await fetch(
        `https://api.pagar.me/core/v5/tokens?appId=${apiKey}`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'card',
            card
          })
        }
      )

      try {
        const data = await resp.json()
        if (data.id) {
          resolve(data.id)
        }
      } catch (err) {
        console.error(err)
        reject(err)
      }
    })
  }
}())
