#!/bin/bash
echo "Running tests before push..."
npm test || { echo "Tests failed. Push aborted."; exit 1; }
echo "Building..."
npx vite build || { echo "Build failed. Push aborted."; exit 1; }
echo "All checks passed."
