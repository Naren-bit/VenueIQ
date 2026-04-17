# Contributing to VenueIQ

Thank you for your interest in contributing to VenueIQ! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites
- Node.js 18+
- A Firebase project with Realtime Database enabled
- A [Gemini API key](https://aistudio.google.com/apikey)

### Quick Start
```bash
git clone https://github.com/Naren-bit/VenueIQ.git
cd VenueIQ
npm install          # auto-installs backend deps via postinstall
npm run dev          # starts backend on port 3001
```

## Project Structure
```
VenueIQ/
├── public/                  # Frontend (static PWA)
│   ├── index.html           # Landing page
│   ├── app.html             # Main PWA application
│   ├── sw.js                # Service Worker for offline support
│   └── manifest.json        # PWA manifest
├── venueiq-backend/         # Backend (Express + Socket.IO)
│   ├── src/
│   │   ├── server.js        # Express app entry point
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic (Gemini, Firebase, etc.)
│   │   └── middleware/      # Error handling, logging
│   └── tests/               # Jest test suite
├── GOOGLE_SERVICES.md       # Google services integration docs
├── Dockerfile               # Cloud Run deployment
├── cloudbuild.yaml          # CI/CD pipeline
└── README.md                # Project documentation
```

## Code Style
- Use `const` and `let`, never `var`
- Use JSDoc comments for all exported functions
- Follow ESLint rules defined in `.eslintrc.json`
- Keep functions small and focused (< 50 lines)

## Testing
```bash
cd venueiq-backend
npm test                     # Run all tests
npm run test:coverage        # Run with coverage report
npm run test:watch           # Watch mode
```

All new routes and services must have corresponding test cases in `tests/`.

## Commit Messages
Use conventional commit format:
- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `test: add/update tests`
- `refactor: code restructuring`

## Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit changes with descriptive messages
4. Run `npm test` to ensure all tests pass
5. Submit a PR with a clear description

## License
By contributing, you agree that your contributions will be licensed under the MIT License.
