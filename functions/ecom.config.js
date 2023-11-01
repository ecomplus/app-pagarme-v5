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
            title: 'Habilitar recorrência via cartão',
            description: 'Habilitar pagamento recorrente com cartão via Pagar.me',
            default: true
          },
          disable: {
            type: 'boolean',
            title: 'Desabilitar pagamento via cartão',
            description: 'Desabilitar pagamento com cartão via Pagar.me',
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
            description: 'Habilitar pagamento recorrente com boleto bancário via Pagar.me',
            default: false
          },
          disable: {
            type: 'boolean',
            title: 'Desabilitar pagamento via boleto',
            description: 'Desabilitar pagamento com boleto bancário via Pagar.me',
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
    account_deposit: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          disable: {
            type: 'boolean',
            title: 'Desabilitar Pix',
            description: 'Desabilitar pagamento com Pix via Pagar.me',
            default: true
          },
          due_time: {
            type: 'integer',
            minimum: 1,
            maximum: 9999,
            default: 60,
            title: 'Minutos para validade do Pix'
          },
          label: {
            type: 'string',
            maxLength: 50,
            title: 'Rótulo',
            description: 'Nome da forma de pagamento exibido para os clientes',
            default: 'Pix'
          },
          icon: {
            type: 'string',
            maxLength: 255,
            format: 'uri',
            title: 'Ícone',
            description: 'Ícone customizado para a forma de pagamento, URL da imagem'
          }
        },
        title: 'Pix',
        description: 'Configurações adicionais para Pix'
      },
      hide: false
    },
    discount: {
      schema: {
        type: 'object',
        required: [
          'value'
        ],
        additionalProperties: false,
        properties: {
          apply_at: {
            type: 'string',
            enum: [
              'total',
              'subtotal'
            ],
            default: 'subtotal',
            title: 'Aplicar desconto em',
            description: 'Em qual valor o desconto deverá ser aplicado no checkout'
          },
          min_amount: {
            type: 'integer',
            minimum: 1,
            maximum: 999999999,
            title: 'Pedido mínimo',
            description: 'Montante mínimo para aplicar o desconto'
          },
          type: {
            type: 'string',
            enum: [
              'percentage',
              'fixed'
            ],
            default: 'percentage',
            title: 'Tipo de desconto',
            description: 'Desconto com valor percentual ou fixo'
          },
          value: {
            type: 'number',
            minimum: -99999999,
            maximum: 99999999,
            title: 'Valor do desconto',
            description: 'Valor percentual ou fixo a ser descontado, dependendo to tipo configurado'
          },
          banking_billet: {
            type: 'boolean',
            default: true,
            title: 'Desconto no boleto',
            description: 'Habilitar desconto via boleto Pagar.me (padrão)'
          },
          credit_card: {
            type: 'boolean',
            default: true,
            title: 'Desconto no cartão',
            description: 'Habilitar desconto com cartão de crédito via Pagar.me'
          },
          account_deposit: {
            type: 'boolean',
            default: true,
            title: 'Desconto no Pix',
            description: 'Habilitar desconto com Pix via Pagar.me'
          }
        },
        title: 'Desconto',
        description: 'Desconto a ser aplicado para pagamentos via Pagar.me (Descontos não aplicavéis a recorrência)'
      },
      hide: false
    },
    installments: {
      schema: {
        type: 'object',
        required: [
          'max_number'
        ],
        additionalProperties: false,
        properties: {
          min_installment: {
            type: 'number',
            minimum: 1,
            maximum: 99999999,
            default: 5,
            title: 'Parcela mínima',
            description: 'Valor mínimo da parcela'
          },
          max_number: {
            type: 'integer',
            minimum: 2,
            maximum: 999,
            title: 'Máximo de parcelas',
            description: 'Número máximo de parcelas'
          },
          monthly_interest: {
            type: 'number',
            minimum: 0,
            maximum: 9999,
            default: 0,
            title: 'Juros mensais',
            description: 'Taxa de juros mensal, zero para parcelamento sem juros'
          },
          max_interest_free: {
            type: 'integer',
            minimum: 2,
            maximum: 999,
            title: 'Parcelas sem juros',
            description: 'Mesclar parcelamento com e sem juros (ex.: até 3x sem juros e 12x com juros)'
          },
          interest_free_min_amount: {
            type: 'integer',
            minimum: 1,
            maximum: 999999999,
            title: 'Mínimo sem juros',
            description: 'Montante mínimo para parcelamento sem juros'
          }
        },
        title: 'Parcelamento',
        description: 'Opções de parcelamento no cartão via Pagar.me'
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
            min_amount: {
              type: 'number',
              minimum: 0,
              maximum: 999999999,
              title: 'Pedido mínimo',
              default: 0,
              description: 'Montante mínimo para listar o plano'
            },
            discount: {
              title: 'Desconto',
              type: 'object',
              required: [
                'value'
              ],
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'percentage',
                    'fixed'
                  ],
                  default: 'percentage',
                  title: 'Tipo de desconto',
                  description: 'Desconto com valor percentual ou fixo'
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
                  description: 'Em qual valor o desconto deverá ser aplicado nas parcelas da recorrência'
                }
              }
            },
            discount_first_installment: {
              title: 'Desconto 1ª parcela',
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'percentage',
                    'fixed'
                  ],
                  default: 'percentage',
                  title: 'Tipo de desconto',
                  description: 'Desconto com valor percentual ou fixo'
                },
                value: {
                  type: 'number',
                  minimum: 0,
                  maximum: 99999999,
                  title: 'Valor do desconto',
                  description: 'Valor percentual/fixo do desconto da 1ª parcela da recorrência'
                },
                apply_at: {
                  type: 'string',
                  enum: [
                    'total',
                    'subtotal',
                  ],
                  default: 'subtotal',
                  title: 'Aplicar desconto em',
                  description: 'Em qual valor o desconto da 1ª parcela da recorrência deverá ser aplicado no checkout'
                }
              }
            }
          }
        }
      },
      hide: false
    },
    recurrency_category_ids: {
      schema: {
        title: 'Categorias para assinatura',
        description: 'Opcional para limitar as categorias disponíveis para assinatura, por padrão todos os produtos da loja serão assináveis',
        type: 'array',
        items: {
          type: 'string',
          pattern: '^[a-f0-9]{24}$',
          title: 'ID da categoria'
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
