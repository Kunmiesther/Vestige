import { ARC_TESTNET } from "@/lib/arc";

export const CCTP_TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
export const CCTP_MESSAGE_TRANSMITTER_V2 = "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD" as const;
export const CCTP_FORWARDING_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;

export const CCTP_SOURCE_CHAINS = {
  11155111: {
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    label: "Ethereum Sepolia",
    domain: 0,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    tokenMessengerAddress: CCTP_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: CCTP_MESSAGE_TRANSMITTER_V2,
    explorerUrl: "https://sepolia.etherscan.io",
    rpcUrls: ["https://rpc.sepolia.org"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    eta: "10-20 min",
  },
  84532: {
    chainId: 84532,
    chainIdHex: "0x14a34",
    label: "Base Sepolia",
    domain: 6,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    tokenMessengerAddress: CCTP_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: CCTP_MESSAGE_TRANSMITTER_V2,
    explorerUrl: "https://base-sepolia.blockscout.com",
    rpcUrls: ["https://sepolia.base.org"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    eta: "8-15 min",
  },
  421614: {
    chainId: 421614,
    chainIdHex: "0x66eee",
    label: "Arbitrum Sepolia",
    domain: 3,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessengerAddress: CCTP_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: CCTP_MESSAGE_TRANSMITTER_V2,
    explorerUrl: "https://sepolia.arbiscan.io",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    eta: "10-18 min",
  },
} as const;

export const CCTP_ARC = {
  chainId: ARC_TESTNET.chainId,
  chainIdHex: ARC_TESTNET.chainIdHex,
  label: ARC_TESTNET.name,
  domain: 26,
  usdcAddress: "0x3600000000000000000000000000000000000000" as const,
  tokenMessengerAddress: CCTP_TOKEN_MESSENGER_V2,
  messageTransmitterAddress: CCTP_MESSAGE_TRANSMITTER_V2,
  explorerUrl: ARC_TESTNET.explorerUrl,
  rpcUrls: [ARC_TESTNET.rpcUrl],
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  eta: "2-5 min",
} as const;
