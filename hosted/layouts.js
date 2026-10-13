// Account positions from pump-fun/pump-public-docs IDLs, checked 2026-10-13.
export const LAYOUTS = {
  "Pump": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "pool": 3,
      "mint": 2,
      "user": 6
    },
    {
      "name": "buy_exact_quote_in_v2",
      "discriminator": [
        194,
        171,
        28,
        70,
        104,
        77,
        91,
        47
      ],
      "pool": 10,
      "mint": 1,
      "user": 13
    },
    {
      "name": "buy_exact_quote_in_v3",
      "discriminator": [
        225,
        247,
        80,
        30,
        213,
        179,
        132,
        136
      ],
      "pool": 5,
      "mint": 1,
      "user": 8
    },
    {
      "name": "buy_exact_sol_in",
      "discriminator": [
        56,
        252,
        116,
        8,
        158,
        223,
        205,
        95
      ],
      "pool": 3,
      "mint": 2,
      "user": 6
    },
    {
      "name": "buy_v2",
      "discriminator": [
        184,
        23,
        238,
        97,
        103,
        197,
        211,
        61
      ],
      "pool": 10,
      "mint": 1,
      "user": 13
    },
    {
      "name": "buy_v3",
      "discriminator": [
        7,
        5,
        29,
        196,
        245,
        23,
        101,
        80
      ],
      "pool": 5,
      "mint": 1,
      "user": 8
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "pool": 3,
      "mint": 2,
      "user": 6
    },
    {
      "name": "sell_v2",
      "discriminator": [
        93,
        246,
        130,
        60,
        231,
        233,
        64,
        178
      ],
      "pool": 10,
      "mint": 1,
      "user": 13
    },
    {
      "name": "sell_v3",
      "discriminator": [
        28,
        146,
        222,
        119,
        38,
        196,
        105,
        213
      ],
      "pool": 5,
      "mint": 1,
      "user": 8
    }
  ],
  "PumpSwap": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "pool": 0,
      "mint": 3,
      "user": 1
    },
    {
      "name": "buy_exact_quote_in",
      "discriminator": [
        198,
        46,
        21,
        82,
        180,
        217,
        232,
        112
      ],
      "pool": 0,
      "mint": 3,
      "user": 1
    },
    {
      "name": "buy_exact_quote_in_v2",
      "discriminator": [
        194,
        171,
        28,
        70,
        104,
        77,
        91,
        47
      ],
      "pool": 0,
      "mint": 3,
      "user": 1
    },
    {
      "name": "buy_v2",
      "discriminator": [
        184,
        23,
        238,
        97,
        103,
        197,
        211,
        61
      ],
      "pool": 0,
      "mint": 3,
      "user": 1
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "pool": 0,
      "mint": 3,
      "user": 1
    },
    {
      "name": "sell_v2",
      "discriminator": [
        93,
        246,
        130,
        60,
        231,
        233,
        64,
        178
      ],
      "pool": 0,
      "mint": 3,
      "user": 1
    }
  ]
};
