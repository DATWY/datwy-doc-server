---
title: DatWY Doc Server
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# DatWY Document Downloader Server 🚀📄

High-performance, auto-scaling backend server for downloading & converting **Studocu & Scribd** documents to crisp, 100% original full-bleed **PDFs** without watermarks or page cropping.

## 🌟 Key Features
- **Cloudflare Turnstile Auto-Solve**: Seamlessly handles Cloudflare Turnstile bot verification challenges.
- **Deep Progressive Unblurring**: Automatically unlocks and unblurs all protected document pages & vector assets.
- **Flawless Zero-Crop A4 Print Layout**: Resets parent transforms and CSS offsets for 100% accurate page-by-page alignment.
- **Realtime Server-Sent Events (SSE)**: Streams live progress updates directly to the web client.
- **Docker-Ready for Hugging Face Spaces (16GB RAM Free)**: Bundles Google Chrome stable and required Linux graphics libraries with UID 1000 and Xvfb.
- **Auto Firebase RTDB Sync**: Syncs online status and URL directly to Firebase Realtime Database.

## 🛠️ Tech Stack
- **Node.js 20+** & **Express**
- **Puppeteer Real Browser** with Google Chrome Stable
- **Docker** on Debian Bullseye
- **Xvfb** Virtual Framebuffer

## 🚀 Free 24/7 Deploy on Hugging Face Spaces (Recommended: 16GB RAM Free)
1. Go to [huggingface.co/new-space](https://huggingface.co/new-space).
2. Set Space Name: `datwy-doc-server`.
3. Select **Docker** (Blank).
4. License: **MIT** / Visibility: **Public**.
5. Push this repository or upload files (`Dockerfile`, `package.json`, `index.js`, `controllers/`, `services/`, `README.md`).
6. Hugging Face builds and runs the container with 16GB RAM for free!
7. The server automatically updates Firebase Realtime Database with its 24/7 HTTPS URL!

