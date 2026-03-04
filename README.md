# Playwright Service

Playwright repository for Service Cloud Playwright scripts

## Overview

This repository contains Playwright test scripts for Service Cloud, leveraging `hps-playwright-core` for enhanced testing capabilities including performance metrics capture (e.g., EPT - End-to-End Performance Time).

## Prerequisites

- **Node.js** >= 18.10
- **npm** >= 9.1

## Installation

1. Clone the repository:
```bash
git clone https://github.com/playwright-service/playwright-service.git
cd playwright-service
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```
## Usage

```bash
# Run all tests
npx playwright test
```