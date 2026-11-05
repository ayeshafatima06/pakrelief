import axios from 'axios';
import { auth } from './firebase';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    config.headers.Authorization = `Bearer ${await firebaseUser.getIdToken()}`;
  }
  return config;
});

export default api;
