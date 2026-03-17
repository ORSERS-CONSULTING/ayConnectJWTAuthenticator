// index.js
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const http = require("http"); // <-- added
const { Server } = require("socket.io"); // <-- added

const authRoutes = require("./routes/authRoutes");
const ayRoutes = require("./routes/ayconnectRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

// If behind proxy/API Gateway, trust all proxy hops so X-Forwarded-For works correctly
app.set("trust proxy", 1);

// === Office IP logic ===
const OFFICE_IP = "94.206.200.125";

// Normalize & detect client IP (works with proxies and ::ffff: prefix)
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  const ip = (xff ? xff.split(",")[0].trim() : req.ip) || "";
  return ip.replace("::ffff:", "");
}

function isOffice(req) {
  return getClientIp(req) === OFFICE_IP;
}

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cors());

// === Rate Limiting ===
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000,
  skip: (req) => isOffice(req) || req.path === "/health" || req.path === "/debug/ip",
  message: "Too many requests – please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// 2) Auth limiter (higher than WAF)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => isOffice(req),
  message: "Too many login attempts – please wait",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/auth", authLimiter);

// 3) AYConnect heavy limiter (higher than WAF)
const heavyUseLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5000,
  skip: (req) => isOffice(req),
  message: "Too many requests to AYCONNECT – please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/ayconnect", heavyUseLimiter);
// === Routes ===
app.use("/payment", paymentRoutes);
app.use("/auth", authRoutes);
app.use("/ayconnect", ayRoutes);




// === Health and Debug Routes ===
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/debug/ip", (req, res) => {
  res.json({
    ip: req.ip,
    clientIp: getClientIp(req),
    xff: req.header("x-forwarded-for"),
    socket: req.socket.remoteAddress,
    isOffice: isOffice(req),
  });
});

// -----------------------------------------------------
//  🔥 Create HTTP server and WebSocket server
// -----------------------------------------------------

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Your Expo app must be able to connect
  },
});

// -----------------------------------------------------
//  🔥 LIVE CHAT WEBSOCKET HANDLERS
// -----------------------------------------------------
io.on("connection", (socket) => {

  // join chat room
  socket.on("join", ({ ticketId }) => {
    socket.join(`ticket:${ticketId}`);
  });

  // typing indicator
  socket.on("typing", ({ ticketId }) =>
    socket.to(`ticket:${ticketId}`).emit("typing")
  );

  socket.on("typing:stop", ({ ticketId }) =>
    socket.to(`ticket:${ticketId}`).emit("typing:stop")
  );

  // text message
  socket.on("message:send", (data, ack) => {
    const msg = {
      id: Date.now().toString(),
      text: data.body,
      senderId: data.senderId || 99999,
      senderName: "Support",
      createdAt: new Date().toISOString(),
      status: "delivered",
    };

    io.to(`ticket:${data.ticketId}`).emit("message:new", msg);
    ack?.();
  });

  // file upload simulation
  socket.on("message:file", (data, ack) => {
    socket.emit("upload:progress", {
      tempId: data.tempId,
      progress: 50,
    });

    setTimeout(() => {
      io.to(`ticket:${data.ticketId}`).emit("upload:done", {
        tempId: data.tempId,
        url: "https://your-file-server.com/uploads/" + data.fileName,
      });
    }, 1200);

    ack?.({ ok: true });
  });

  socket.on("file:retry", ({ ticketId, tempId }) => {
    io.to(`ticket:${ticketId}`).emit("upload:done", {
      tempId,
      url: "https://your-file-server.com/uploads/retry-" + tempId,
    });
  });
});
//  🔥 Start server (Express + WebSockets)
// -----------------------------------------------------

const PORT = process.env.PORT || 3000;
const HOST = "127.0.0.1";

server.listen(PORT, HOST, () => {
});
