import express from 'express';
import path from 'path';
import app from './src/server/app';

const PORT = process.env.PORT || 3000;

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
