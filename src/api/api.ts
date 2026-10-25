import axios from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://fixnow-production-f0e8.up.railway.app";

const API = axios.create({
  baseURL: API_BASE_URL.replace(/\/+$/, ""),
  headers: {
    "Content-Type": "application/json",
  },
});

export default API;