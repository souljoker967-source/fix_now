import { create } from "axios";

let authToken: string | null = null;

const API = create({
  baseURL:
    process.env.EXPO_PUBLIC_API_URL || "https://fix-now.onrender.com",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    API.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete API.defaults.headers.common.Authorization;
  }
}

API.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export default API;