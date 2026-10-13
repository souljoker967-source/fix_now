import axios from "axios";

const API = axios.create({
  baseURL: "https://fixnow-production-f0e8.up.railway.app",
  headers: {
    "Content-Type": "application/json",
  },
});

export default API;