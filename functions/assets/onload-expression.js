; (function () {
  const apiKey = window._pagarmeKey
  // Chave do site do Cloudflare Turnstile, posta pelo `list_payments` só quando a
  // loja liga a verificação anti-robô (ver `functions/lib/turnstile.js`)
  const turnstileKey = window._pagarmeTurnstileKey
  const isTurnstileEnforced = window._pagarmeTurnstileMode === 'enforce'
  // Limite do `credit_card.hash` no schema do checkout
  const MAX_HASH_LENGTH = 6000

  const tokenizeCard = function (cardClient) {
    const card = {
      number: cardClient.number,
      holder_name: cardClient.name,
      exp_month: cardClient.month,
      exp_year: cardClient.year,
      cvv: cardClient.cvc
    }
    return fetch(
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
          return data.id
        }
        throw new Error('Credencial inválida')
      })
      .catch(err => {
        console.log('credencial inválida', err)
        throw err
      })
  }

  // Verificação anti-robô (Cloudflare Turnstile) junto com o hash do cartão, que o
  // `create_transaction` confere antes de cobrar. Toda espera tem prazo: sem token
  // o hash segue sozinho e quem decide é o servidor.
  const setupTurnstile = function (siteKey) {
    const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    // O token vale 5 min no servidor, descartamos um pouco antes
    const TOKEN_MAX_AGE_MS = 4 * 60 * 1000
    const API_LOAD_WAIT_MS = 8 * 1000
    const TOKEN_WAIT_MS = 15 * 1000
    const INTERACTION_WAIT_MS = 2 * 60 * 1000

    const backdrop = document.createElement('div')
    backdrop.style.cssText = 'display:none;position:fixed;top:0;right:0;bottom:0;left:0;' +
      'z-index:2147483000;background:rgba(0,0,0,.6)'
    // Cartão com a frase e o desafio, com fundo próprio para o texto não se misturar
    // com a página. Invisível enquanto não houver um pagamento esperando interação,
    // para o desafio nunca cobrir o checkout por conta própria. `opacity:0` não tira
    // a frase do leitor de tela, por isso o `aria-hidden` enquanto o cartão não aparece
    const panel = document.createElement('div')
    panel.style.cssText = 'position:fixed;top:50%;left:8px;right:8px;z-index:2147483001;' +
      'max-width:332px;margin:0 auto;transform:translateY(-50%);padding:36px 0 16px;' +
      'border-radius:12px;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.3);' +
      'opacity:0;pointer-events:none'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-labelledby', 'pagarme-turnstile-title')
    panel.setAttribute('aria-hidden', 'true')
    panel.tabIndex = -1
    const panelTitle = document.createElement('p')
    panelTitle.id = 'pagarme-turnstile-title'
    panelTitle.textContent = 'Confirme que você não é um robô para concluir a compra'
    panelTitle.style.cssText = 'margin:0 0 12px;padding:0 16px;color:#222;' +
      'font:600 16px/1.4 sans-serif;text-align:center'
    const widgetContainer = document.createElement('div')
    widgetContainer.style.cssText = 'display:flex;justify-content:center;min-height:65px'
    // O × fica por último no DOM para o Tab chegar antes à caixa do desafio, e
    // desabilitado enquanto o cartão não aparece, para não ser uma parada invisível do Tab
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.textContent = '×'
    closeButton.setAttribute('aria-label', 'Fechar')
    closeButton.disabled = true
    closeButton.style.cssText = 'position:absolute;top:2px;right:2px;width:40px;height:40px;' +
      'padding:0;border:0;border-radius:8px;background:none;color:#555;' +
      'font:400 24px/40px sans-serif;cursor:pointer'
    panel.appendChild(panelTitle)
    panel.appendChild(widgetContainer)
    panel.appendChild(closeButton)

    const notice = document.createElement('div')
    notice.setAttribute('role', 'alert')
    notice.textContent = 'Não conseguimos validar seu acesso para pagar com cartão. Desative bloqueadores ' +
      'de anúncio e recarregue a página, ou escolha outra forma de pagamento.'
    notice.style.cssText = 'display:none;position:fixed;top:16px;left:8px;right:8px;' +
      'z-index:2147483002;max-width:420px;margin:0 auto;padding:12px 16px;border-radius:6px;' +
      'background:#b00020;color:#fff;font:600 14px/1.4 sans-serif;text-align:center'
    let noticeTimer = 0
    const showNotice = function () {
      if (!notice.isConnected) document.body.appendChild(notice)
      notice.style.display = 'block'
      // Um aviso novo recomeça a contagem, senão o timer do anterior o esconde cedo
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(function () {
        notice.style.display = 'none'
      }, 10000)
    }

    const getApi = () => window.turnstile || null
    let scriptStartedAt = 0
    let isScriptLoading = false
    let loadListeners = []
    // Um script que nunca termina de carregar não pode segurar o pagamento
    const loadApi = () => new Promise(function (resolve) {
      if (getApi()) {
        resolve(getApi())
        return
      }
      const finish = () => resolve(getApi())
      loadListeners.push(finish)
      if (!isScriptLoading) {
        isScriptLoading = true
        scriptStartedAt = Date.now()
        const script = document.createElement('script')
        const settleScript = function () {
          isScriptLoading = false
          const listeners = loadListeners
          loadListeners = []
          listeners.forEach(listener => listener())
        }
        script.src = TURNSTILE_SCRIPT
        script.async = true
        script.onload = settleScript
        script.onerror = function () {
          script.remove()
          settleScript()
        }
        document.head.appendChild(script)
      }
      const waitMs = Math.max(0, API_LOAD_WAIT_MS - (Date.now() - scriptStartedAt))
      setTimeout(finish, waitMs)
    })

    let widgetId
    let storedToken = null
    let isChallenging = false
    let needsInteraction = false
    // Tokens são de uso único: pedidos simultâneos entram na fila, um token para cada
    const waiters = []
    let isOverlayVisible = false
    let focusedBeforeOverlay = null
    const syncOverlay = function () {
      const isVisible = needsInteraction && waiters.length > 0
      if (isVisible && !backdrop.isConnected) document.body.appendChild(backdrop)
      backdrop.style.display = isVisible ? 'block' : 'none'
      panel.style.opacity = isVisible ? '1' : '0'
      panel.style.pointerEvents = isVisible ? 'auto' : 'none'
      if (isVisible === isOverlayVisible) return
      isOverlayVisible = isVisible
      if (isVisible) {
        panel.removeAttribute('aria-hidden')
        panel.setAttribute('aria-modal', 'true')
        closeButton.disabled = false
        // O foco vai para o cartão: o leitor de tela anuncia o desafio e, no celular,
        // o teclado virtual fecha em vez de cobrir a caixa
        const { activeElement } = document
        focusedBeforeOverlay = activeElement instanceof window.HTMLElement ? activeElement : null
        panel.focus({ preventScroll: true })
        return
      }
      panel.setAttribute('aria-hidden', 'true')
      panel.removeAttribute('aria-modal')
      if (panel.contains(document.activeElement)) {
        // O foco não pode ficar no cartão escondido (nem dentro do iframe do desafio):
        // volta para onde estava ou, se o elemento sumiu, para a página
        panel.focus({ preventScroll: true })
        panel.blur()
        if (focusedBeforeOverlay && focusedBeforeOverlay.isConnected) {
          focusedBeforeOverlay.focus({ preventScroll: true })
        }
      }
      focusedBeforeOverlay = null
      closeButton.disabled = true
    }
    const finishWaiter = function (waiter, token) {
      const index = waiters.indexOf(waiter)
      if (index === -1) return
      waiters.splice(index, 1)
      clearTimeout(waiter.timer)
      waiter.resolve(token)
      syncOverlay()
    }
    const armWaiter = function (waiter, waitMs) {
      clearTimeout(waiter.timer)
      waiter.timer = setTimeout(function () {
        // Sem resposta no prazo, o desafio é dado como travado: o próximo pagamento o reinicia
        isChallenging = false
        finishWaiter(waiter, null)
      }, waitMs)
    }
    const releaseWaiters = function () {
      waiters.slice().forEach(waiter => finishWaiter(waiter, null))
    }
    // O × do cartão, ou Esc, desiste da espera e envia sem token. Tocar fora não faz
    // nada: com o servidor bloqueando, um esbarrão custaria o pedido ao cliente
    closeButton.addEventListener('click', releaseWaiters)
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && isOverlayVisible) releaseWaiters()
    })
    const failChallenge = function () {
      isChallenging = false
      needsInteraction = false
      storedToken = null
      releaseWaiters()
      syncOverlay()
    }
    const startChallenge = function (turnstile) {
      storedToken = null
      isChallenging = true
      needsInteraction = false
      try {
        if (widgetId !== undefined) {
          turnstile.reset(widgetId)
          return
        }
        document.body.appendChild(panel)
        widgetId = turnstile.render(widgetContainer, {
          sitekey: siteKey,
          action: 'checkout',
          language: 'pt-br',
          // O cartão é branco: sem isto a caixa segue o tema do aparelho e sai escura
          theme: 'light',
          appearance: 'interaction-only',
          'refresh-expired': 'never',
          callback: function (token) {
            isChallenging = false
            needsInteraction = false
            const waiter = waiters[0]
            if (waiter) {
              finishWaiter(waiter, token)
              if (waiters.length) startChallenge(turnstile)
            } else {
              storedToken = { value: token, time: Date.now() }
            }
            syncOverlay()
          },
          'expired-callback': function () {
            storedToken = null
          },
          'error-callback': function () {
            failChallenge()
            return true
          },
          'timeout-callback': failChallenge,
          'before-interactive-callback': function () {
            needsInteraction = true
            waiters.forEach(waiter => armWaiter(waiter, INTERACTION_WAIT_MS))
            syncOverlay()
          },
          'after-interactive-callback': function () {
            needsInteraction = false
            syncOverlay()
          }
        })
        // Sem id o widget não foi montado e nenhum callback virá
        if (widgetId === undefined) failChallenge()
      } catch (err) {
        console.error(err)
        failChallenge()
      }
    }

    const takeToken = async function () {
      const turnstile = await loadApi()
      if (!turnstile) return null
      if (storedToken && Date.now() - storedToken.time < TOKEN_MAX_AGE_MS) {
        const { value } = storedToken
        storedToken = null
        return value
      }
      return new Promise(function (resolve) {
        const waiter = { resolve, timer: 0 }
        waiters.push(waiter)
        armWaiter(waiter, needsInteraction ? INTERACTION_WAIT_MS : TOKEN_WAIT_MS)
        if (!isChallenging) startChallenge(turnstile)
        syncOverlay()
      })
    }

    // Adianta o desafio ao abrir o cartão no checkout, para o token já estar pronto no pagamento
    const prewarm = function () {
      if (widgetId !== undefined || isChallenging) return
      loadApi().then(function (turnstile) {
        if (turnstile && widgetId === undefined && !isChallenging) startChallenge(turnstile)
      })
    }

    return { takeToken, prewarm, showNotice }
  }

  let turnstile = null
  if (turnstileKey) {
    // A expressão roda de novo a cada carga das formas de pagamento: um widget só por página
    if (!window._pagarmeTurnstile) {
      try {
        window._pagarmeTurnstile = setupTurnstile(turnstileKey)
      } catch (err) {
        console.error(err)
      }
    }
    turnstile = window._pagarmeTurnstile || null
    if (turnstile) turnstile.prewarm()
  }

  window._pagarmeHash = async function (cardClient) {
    const hash = await tokenizeCard(cardClient)
    if (!turnstile) return hash
    let token = null
    try {
      token = await turnstile.takeToken()
    } catch (err) {
      console.error(err)
    }
    if (!token) {
      // Com a verificação obrigatória, o servidor vai recusar o cartão sem token
      if (isTurnstileEnforced) turnstile.showNotice()
      return hash
    }
    try {
      // O `create_transaction` separa o token do hash (`unwrapCardHash`)
      const envelope = btoa(JSON.stringify({ hash, turnstile: token }))
      if (envelope.length <= MAX_HASH_LENGTH) return envelope
    } catch (err) {
      console.error(err)
    }
    return hash
  }
}())
