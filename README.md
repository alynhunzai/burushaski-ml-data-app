# 🏔️ Burushaski Language Hub: NLP Data Collection Framework

![React](https://img.shields.io/badge/React-20232A?style=plastic&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=plastic&logo=vite&logoColor=FFD62E)
![Firebase](https://img.shields.io/badge/firebase-ffca28?style=plastic&logo=firebase&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=plastic&logo=tailwind-css&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

An open-source, crowdsourced data collection platform designed to build a high-quality parallel corpus for **Burushaski**, a language isolate spoken in the Gilgit-Baltistan region of Pakistan.

This platform facilitates the collection of tri-modal data (English Text ➔ Romanised Burushaski Text ➔ Burushaski Audio) to train future Neural Machine Translation (NMT), Automatic Speech Recognition (ASR), and Text-to-Speech (TTS) models.

---

## 📖 Table of Contents

- [🏔️ Burushaski Language Hub: NLP Data Collection Framework](#️-burushaski-language-hub-nlp-data-collection-framework)
  - [📖 Table of Contents](#-table-of-contents)
  - [🔍 About the Project](#-about-the-project)
  - [✨ Key Features](#-key-features)
  - [🛠️ Architecture \& Tech Stack](#️-architecture--tech-stack)
  - [🚀 Local Installation](#-local-installation)
    - [Prerequisites](#prerequisites)
    - [1. Clone the Repository](#1-clone-the-repository)
    - [2. Install Dependencies](#2-install-dependencies)
    - [3. Firebase Configuration](#3-firebase-configuration)
    - [4. Run the Development Server](#4-run-the-development-server)
  - [📊 Data Pipeline \& Quota Protection](#-data-pipeline--quota-protection)
  - [Seeding Benchmark Database](#seeding-benchmark-database)
  - [🤝 Contributing](#-contributing)
  - [📬 Contact](#-contact)

---

## 🔍 About the Project

Burushaski is a highly complex language isolate lacking a universally standardized script and robust digital datasets. Standard cross-lingual transfer learning techniques struggle with Burushaski due to its unique grammatical structure (such as complex ergative case marking and extensive verbal prefixes).

**The Goal:** To solve the "low-resource" NLP bottleneck by actively crowdsourcing clean, validated, and dialect-tagged data from native speakers (Hunza and Nagar dialects) using standardized English benchmarks like **FLORES-200** and **Tatoeba**.

---

## ✨ Key Features

1. **Text Translation Engine**: Users translate standardized English benchmark prompts into Romanised Burushaski.
2. **Tri-Modal Audio Collection**: Utilizes a cognitive "Write First, Speak Second" workflow. Users transcribe their Burushaski translation first, then read it aloud, preventing "sight-translation" stutters and ensuring pristine ASR audio quality.
3. **Peer Validation Board**: A built-in crowdsourced auditing system. Contributions require a consensus of **3 positive peer validations** before being promoted to the final ML training corpus.
4. **Demographic Tagging**: Optional metadata collection (Age, Gender, Dialect Region) to reduce bias during model training.
5. **Smart Quota Protection**: Integrates a 24-hour local browser cache for benchmark prompts and a global daily write limit to ensure Firebase free-tier (Spark Plan) quotas are never exhausted.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 18, Vite
- **Styling**: Tailwind CSS, Lucide React (Icons)
- **Backend Backend/BaaS**: Google Firebase
  - **Firestore**: Real-time NoSQL database for storing prompts, translations, and metadata.
  - **Cloud Storage**: Secure binary storage for `.wav` audio vocal blobs.
  - **Firebase Auth**: Anonymous session token generation for user tracking and metric gamification.

---

## 🚀 Local Installation

### Prerequisites

- Node.js (v16.0.0 or higher)
- A Firebase Account (Spark Plan is sufficient)

### 1. Clone the Repository

```bash
git clone https://github.com/alynhunzai/burushaski-ml-data-app.git
cd burushaski-ml-data-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Firebase Configuration

Ensure you have created a Firebase project and enabled Firestore, Storage, and Anonymous Authentication. Replace the `firebaseConfig` object inside `./src/App.jsx` with your actual Firebase project keys:

```javascript

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 4. Run the Development Server

```bash
npm run dev
```

Navigate to `http://localhost:5173` to view the app.

## 📊 Data Pipeline & Quota Protection

To protect the platform from malicious bot scraping or accidental Firebase quota exhaustion, the app utilizes:

- **Local Storage Caching**: The 3,000+ benchmark sentences are downloaded once per user per day.

- **Daily Write Cap**: The `system/daily_stats` document tracks real-time database writes. If the community hits 15,000 translations/validations in a single day, the platform safely locks itself and displays a "Daily Target Reached" screen until midnight.

## Seeding Benchmark Database

If you wish to host your own version of this project, you will need to seed the `benchmark_sentences` Firestore collection. You can use the included python script `seed_benchmarks.py` to filter external datasets (like Tatoeba) to an optimal length of 5-15 words.

## 🤝 Contributing

Contributions from linguists, React developers, and Machine Learning engineers are highly appreciated and welcomed!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📬 Contact

Encountered an issue or have linguistic validation inquiries? Connect with me:

- **Email**: `nuraly211@gmail.com`

- **LinkedIn**: [@alynhunz](https://www.linkedin.com/in/alynhunz)

- **GitHub Issues**: Issue Tracker
