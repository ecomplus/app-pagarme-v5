# Pagar.me
Pagamentos recorrentes (assinaturas) com cartão de crédito ou boleto bancário através do [Pagar.Me](https://pagar.me):

* Integração direta com o API v5 do Pagar.Me;
* Atualização automática de status da transação;
* Plano customizável;

## Antes de Começar: 
Configurações no Pagar.Me necessárias para o funcionamento total da integração.

Com seu dashborad do Pagar.Me aberto: 

### Configurações da Conta
1) Vá no menu lateral e clique na na opção **CONFIGURAÇÕES**
2) Em seguida clique em **Conta**
3) Nas opções de configuração da conta, clique em **Editar**
4) Vá até **Domínios** 
![PagarMe banner](https://ecom-pagarme5.web.app/dominios.png)

5) Adicione os domínios utilizados por sua loja, e clique em salvar

### Adicionando os Webhooks

1) No menu lateral na opção **CONFIGURAÇÕES**
2) Clique na opção **Webhooks**
3) Nas opções de webhooks, clique em **Criar Webhook**
4) Na URL adicione a seguinte url:  
`https://us-central1-ecom-pagarme5.cloudfunctions.net/app/pagarme/webhooks?store_id=SEU_STORE_ID_AQUI`

*OBS.:* Lembre-se de substituir `SEU_STORE_ID_AQUI` pelo número do seu `storeId`

![PagarMe banner](https://ecom-pagarme5.web.app/url_webhook.png)

5) Em **Eventos** marque os seguintes eventos:

#### Assinatura: 
- subscription.canceled
- subscription.created

#### Cobrança
- charge.overpaid
- charge.paid
- charge.partial_canceled
- charge.payment_failed
- charge.pending
- charge.processing
- charge.refunded
- charge.underpaid
- charge.updated

![PagarMe banner](https://ecom-pagarme5.web.app/eventos_webhook.png)

6) Por fim Clique em salvar

### Obtendo as Chaves

1) Ainda no menu lateral **CONFIGURAÇÕES**
2) Clique em **Chaves**
3) A chave pública e a chave secreta serão necessárias para as configurações aqui no nosso aplicativo.

![PagarMe banner](https://ecom-pagarme5.web.app/credit-card.png)
