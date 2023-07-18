/* eslint-disable comma-dangle, no-multi-spaces, key-spacing */

/**
 * Edit base E-Com Plus Application object here.
 * Ref.: https://developers.e-com.plus/docs/api/#/store/applications/
 */

const app = {
  app_id: 112381,
  title: 'Pagar.me v5',
  slug: 'pagarme5',
  type: 'external',
  state: 'active',
  authentication: true,

  /**
   * Uncomment modules above to work with E-Com Plus Mods API on Storefront.
   * Ref.: https://developers.e-com.plus/modules-api/
   */
  modules: {
    /**
     * Triggered to calculate shipping options, must return values and deadlines.
     * Start editing `routes/ecom/modules/calculate-shipping.js`
     */
    // calculate_shipping:   { enabled: true },

    /**
     * Triggered to validate and apply discount value, must return discount and conditions.
     * Start editing `routes/ecom/modules/apply-discount.js`
     */
    // apply_discount:       { enabled: true },

    /**
     * Triggered when listing payments, must return available payment methods.
     * Start editing `routes/ecom/modules/list-payments.js`
     */
    list_payments: { enabled: true },

    /**
     * Triggered when order is being closed, must create payment transaction and return info.
     * Start editing `routes/ecom/modules/create-transaction.js`
     */
    create_transaction: { enabled: true },
  },

  /**
   * Uncomment only the resources/methods your app may need to consume through Store API.
   */
  auth_scope: {
    'stores/me': [
      'GET'            // Read store info
    ],
    procedures: [
      'POST'           // Create procedures to receive webhooks
    ],
    products: [
      'GET',           // Read products with public and private fields
      // 'POST',          // Create products
      // 'PATCH',         // Edit products
      // 'PUT',           // Overwrite products
      // 'DELETE',        // Delete products
    ],
    brands: [
      // 'GET',           // List/read brands with public and private fields
      // 'POST',          // Create brands
      // 'PATCH',         // Edit brands
      // 'PUT',           // Overwrite brands
      // 'DELETE',        // Delete brands
    ],
    categories: [
      // 'GET',           // List/read categories with public and private fields
      // 'POST',          // Create categories
      // 'PATCH',         // Edit categories
      // 'PUT',           // Overwrite categories
      // 'DELETE',        // Delete categories
    ],
    customers: [
      // 'GET',           // List/read customers
      // 'POST',          // Create customers
      // 'PATCH',         // Edit customers
      // 'PUT',           // Overwrite customers
      // 'DELETE',        // Delete customers
    ],
    orders: [
      'GET',           // List/read orders with public and private fields
      'POST',          // Create orders
      'PATCH',         // Edit orders
      // 'PUT',           // Overwrite orders
      // 'DELETE',        // Delete orders
    ],
    carts: [
      // 'GET',           // List all carts (no auth needed to read specific cart only)
      // 'POST',          // Create carts
      // 'PATCH',         // Edit carts
      // 'PUT',           // Overwrite carts
      // 'DELETE',        // Delete carts
    ],

    /**
     * Prefer using 'fulfillments' and 'payment_history' subresources to manipulate update order status.
     */
    'orders/fulfillments': [
      // 'GET',           // List/read order fulfillment and tracking events
      // 'POST',          // Create fulfillment event with new status
      // 'DELETE',        // Delete fulfillment event
    ],
    'orders/payments_history': [
      // 'GET',           // List/read order payments history events
      'POST',          // Create payments history entry with new status
      // 'DELETE',        // Delete payments history entry
    ],

    /**
     * Set above 'quantity' and 'price' subresources if you don't need access for full product document.
     * Stock and price management only.
     */
    'products/quantity': [
      // 'GET',           // Read product available quantity
      // 'PUT',           // Set product stock quantity
    ],
    'products/variations/quantity': [
      // 'GET',           // Read variaton available quantity
      // 'PUT',           // Set variation stock quantity
    ],
    'products/price': [
      // 'GET',           // Read product current sale price
      // 'PUT',           // Set product sale price
    ],
    'products/variations/price': [
      // 'GET',           // Read variation current sale price
      // 'PUT',           // Set variation sale price
    ],

    /**
     * You can also set any other valid resource/subresource combination.
     * Ref.: https://developers.e-com.plus/docs/api/#/store/
     */
  },

  admin_settings: {
    pagarme_public_key: {
      schema: {
        type: 'string',
        maxLength: 255,
        title: 'Chave pública',
        description: 'Chave pública versão 5 disponível em: Configurações -> Chaves (https://dash.pagar.me/)'
      },
      hide: true
    },
    pagarme_api_token: {
      schema: {
        type: 'string',
        maxLength: 255,
        title: 'Chave secreta',
        description: 'Chave secreta versão 5 disponível em: Configurações -> Chaves (https://dash.pagar.me/)'
      },
      hide: true
    },
    soft_descriptor: {
      schema: {
        type: 'string',
        title: 'Descrição da cobrança',
        description: 'Como a cobrança será informada na fatura do cartão ou boleto'
      },
      hide: false
    },
    credit_card: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enable_recurrence: {
            type: 'boolean',
            title: 'Habilitar recorrência',
            description: 'Habilitar pagamento recorrente com cartão via Pagar.me',
            default: true
          },
          label: {
            type: 'string',
            maxLength: 50,
            title: 'Rótulo',
            description: 'Nome da forma de pagamento exibido para os clientes',
            default: 'Cartão de crédito'
          },
          text: {
            type: 'string',
            maxLength: 1000,
            title: 'Descrição',
            description: 'Texto auxiliar sobre a forma de pagamento, pode conter tags HTML'
          },
          icon: {
            type: 'string',
            maxLength: 255,
            format: 'uri',
            title: 'Ícone',
            description: 'Ícone customizado para a forma de pagamento, URL da imagem'
          }
        },
        title: 'Cartão de crédito',
        description: 'Configurações adicionais para cartão de crédito'
      },
      hide: false
    },
    banking_billet: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enable_recurrence: {
            type: 'boolean',
            title: 'Habilitar recorrência via boleto',
            description: 'Habilitar pagamento recorrênte com boleto bancário via Pagar.me',
            default: false
          },
          days_due_date: {
            type: 'integer',
            minimum: 1,
            maximum: 999,
            default: 7,
            title: 'Dias corridos até o vencimento',
            description: 'Representa diferença de dias entre a data da requisição e a data de vencimento'
          },
          instructions: {
            type: 'string',
            maxLength: 255,
            title: 'Intruções do boleto',
            description: 'Linhas impressas no boleto para instruções ao operador de caixa ou pagador'
          },
          label: {
            type: 'string',
            maxLength: 50,
            title: 'Rótulo',
            description: 'Nome da forma de pagamento exibido para os clientes',
            default: 'Boleto bancário'
          },
          text: {
            type: 'string',
            maxLength: 1000,
            title: 'Descrição',
            description: 'Texto auxiliar sobre a forma de pagamento, pode conter tags HTML'
          },
          icon: {
            type: 'string',
            maxLength: 255,
            format: 'uri',
            title: 'Ícone',
            description: 'Ícone customizado para a forma de pagamento, URL da imagem'
          }
        },
        title: 'Boleto bancário',
        description: 'Configurações adicionais para boleto bancário'
      },
      hide: false
    },
    recurrence: {
      schema: {
        title: 'Recorrência',
        description: 'Criar tipos de planos para recorrência.',
        type: 'array',
        maxItems: 10,
        items: {
          title: 'Plano',
          type: 'object',
          minProperties: 1,
          properties: {
            label: {
              type: 'string',
              maxLength: 100,
              title: 'Plano',
              description: 'Texto definir um nome para o plano'
            },
            periodicity: {
              type: 'string',
              enum: [
                'Diaria',
                'Semanal',
                'Mensal',
                'Bimestral',
                'Trimestral',
                'Semestral',
                'Anual'
              ],
              default: 'Mensal',
              title: 'Periodicidade da recorrência',
              description: 'Definir a periodicidade da recorrência.'
            },
            discount: {
              title: 'Desconto',
              type: 'object',
              required: [
                'value'
              ],
              properties: {
                percentage: {
                  type: 'boolean',
                  default: false,
                  title: 'Desconto percentual'
                },
                value: {
                  type: 'number',
                  minimum: 0,
                  maximum: 99999999,
                  title: 'Valor do desconto',
                  description: 'Valor percentual/fixo do desconto'
                },
                apply_at: {
                  type: 'string',
                  enum: [
                    'total',
                    'subtotal',
                  ],
                  default: 'subtotal',
                  title: 'Aplicar desconto em',
                  description: 'Em qual valor o desconto deverá ser aplicado no checkout'
                }
              }
            },
            discount_first_installment: {
              title: 'Desconto 1ª parcela',
              type: 'object',
              properties: {
                disable: {
                  type: 'boolean',
                  default: true,
                  title: 'Desativar desconto na primeira recorrência',
                  description: 'Se desabilitado, desconto considerado será o desconto do plano'
                },
                percentage: {
                  type: 'boolean',
                  default: false,
                  title: 'Desconto percentual'
                },
                value: {
                  type: 'number',
                  minimum: 0,
                  maximum: 99999999,
                  title: 'Valor do desconto',
                  description: 'Valor percentual/fixo do desconto'
                },
                apply_at: {
                  type: 'string',
                  enum: [
                    'total',
                    'subtotal',
                  ],
                  default: 'subtotal',
                  title: 'Aplicar desconto em',
                  description: 'Em qual valor o desconto deverá ser aplicado no checkout'
                }
              }
            }
          }
        }
      },
      hide: false
    }
  }
}

/**
 * List of Procedures to be created on each store after app installation.
 * Ref.: https://developers.e-com.plus/docs/api/#/store/procedures/
 */

const procedures = []

/**
* Uncomment and edit code above to configure `triggers` and receive respective `webhooks`:
*/

const { baseUri } = require('./__env')

procedures.push({
  title: app.title,

  triggers: [
    // Receive notifications when products/variations prices or quantities changes:
    {
      resource: 'products',
      field: 'price',
      action: 'change',
    },
    {
      resource: 'products',
      field: 'quantity',
      action: 'change',
    },
    {
      resource: 'products',
      subresource: 'variations',
      field: 'price',
      action: 'change',
    },
    // Receive notifications when order status are set or changed:
    {
      resource: 'orders',
      field: 'status',
    },
    // {
    //   resource: 'orders',
    //   field: 'items',
    // },
  ],

  webhooks: [
    {
      api: {
        external_api: {
          uri: `${baseUri}/ecom/webhook`
        }
      },
      method: 'POST'
    }
  ]
})
/*
* You may also edit `routes/ecom/webhook.js` to treat notifications properly.
*/

exports.app = app

exports.procedures = procedures
