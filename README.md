# DatWY Document Downloader Server 🚀📄

High-performance, auto-scaling backend server for downloading & converting **Studocu & Scribd** documents to crisp, 100% original full-bleed **PDFs** without watermarks or page cropping.

## 🌟 Key Features
- **Cloudflare Turnstile Auto-Solve**: Seamlessly handles Cloudflare Turnstile bot verification challenges.
- **Deep Progressive Unblurring**: Automatically unlocks and unblurs all protected document pages & vector assets.
- **Flawless Zero-Crop A4 Print Layout**: Resets parent transforms and CSS offsets for 100% accurate page-by-page alignment.
- **Realtime Server-Sent Events (SSE)**: Streams live progress updates directly to the web client.
- **Docker-Ready for Render.com**: Bundles Google Chrome stable and required Linux graphics libraries out-of-the-box.

## 🛠️ Tech Stack
- **Node.js 20+** & **Express**
- **Puppeteer Real Browser** with Google Chrome Stable
- **Docker** on Debian Bullseye

## 🚀 One-Click Deploy on Render.com
1. Create a **New Web Service** on [Render.com](https://render.com).
2. Connect this repository (`DATWY/datwy-doc-server`).
3. Select **Docker** environment.
4. Choose **Free Instance ($0/mo)** & **Singapore** region.
5. Click **Create Web Service**.
