# 🌐 Multi-Token Portfolio Dashboard  
### *Your All-in-One Web3 Interface on Algorand*

The Multi-Token Portfolio Dashboard is a unified Web3 application designed to simplify how users and developers interact with the Algorand blockchain.  
It provides real-time token balances, ASA (Algorand Standard Asset) management, transaction exploration, and wallet connectivity — all in one clean interface.

This project was built using React, TypeScript, Vite, Pera Wallet, AlgoKit, and the Algorand SDK, with full support for TestNet and LocalNet environments.

---

## 🚀 Features

### 🔹 1. Real-Time Portfolio View
- Displays ALGO balance
- Shows all ASA holdings
- Fetches and renders ASA metadata (name, unit, decimals)
- Automatically normalizes on-chain BigInt values

### 🔹 2. ASA Token Management
- Create new Algorand Standard Assets (ASA)
- Send ASA tokens to any opt-in address
- Automatic validation and error handling

### 🔹 3. Transaction Explorer
- Shows the latest on-chain transactions from the Indexer
- Supports ALGO and ASA transfers
- Decodes metadata including:
  - Type  
  - Amount  
  - Asset ID  
  - Round  
  - TxID (shortened)

### 🔹 4. Web3 Wallet Connectivity
- Connects with Pera Wallet
- Secure transaction signing
- Full TestNet compatibility

### 🔹 5. Developer-Friendly Workflow
- Built using AlgoKit
- Supports LocalNet + TestNet
- Clean modular architecture
- Strong error handling for decoding, BigInt, and metadata fetching

---

## 🧠 Why This Project?

Managing Algorand assets usually requires multiple tools.  
This dashboard solves that.

| Problem | Solution |
|--------|----------|
| Users need multiple tools | Unified dashboard |
| Hard to view ALGO + ASAs together | Real-time portfolio view |
| Manual ASA creation | Built-in ASA creator |
| Indexer data hard to parse | Clean, structured UI |

The result is a fast, intuitive, developer-first token interface.

---

## 🛠️ Tech Stack

- React + TypeScript + Vite  
- Algorand SDK via AlgoKit utils  
- Pera Wallet Connect (use-wallet-react)  
- TailwindCSS + DaisyUI  
- Notistack  
- Algonode RPC + Indexer endpoints  

---

## 📸 Screenshot


### Dashboard Overview  
<img width="1148" height="864" alt="Screenshot from 2025-12-08 22-23-32" src="https://github.com/user-attachments/assets/57c44825-684f-4005-a45a-22fa3b485b17" />

---

