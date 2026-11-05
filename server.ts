
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'node:url';
import app, { initializeStatutoryAdmin } from './src/server/app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

if (process.env.PAKRELIEF_ADMIN_BOOTSTRAP_PASSWORD) {
  void initializeStatutoryAdmin();
}

// In production, serve the built Vite static assets
app.use(express.static(path.resolve(__dirname, 'dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});
app.listen(PORT, () => {
  console.log(`PakRelief production server running on port ${PORT}`);
});
