const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_NICKNAME = 12;
const MAX_MESSAGE = 500;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => res.send("ok"));

// socket.id -> 닉네임
const users = new Map();

function userList() {
  return [...users.entries()].map(([id, nickname]) => ({ id, nickname }));
}

function isNicknameTaken(nickname) {
  const target = nickname.toLowerCase();
  return [...users.values()].some((n) => n.toLowerCase() === target);
}

io.on("connection", (socket) => {
  socket.on("join", (rawNickname, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const nickname = String(rawNickname || "").trim().slice(0, MAX_NICKNAME);

    if (!nickname) {
      return reply({ ok: false, error: "닉네임을 입력해 주세요." });
    }
    if (isNicknameTaken(nickname)) {
      return reply({ ok: false, error: "이미 사용 중인 닉네임이에요." });
    }

    users.set(socket.id, nickname);
    reply({ ok: true, id: socket.id, nickname });

    io.emit("users", userList());
    socket.broadcast.emit("system", `${nickname}님이 들어왔어요.`);
  });

  socket.on("message", (rawText) => {
    const nickname = users.get(socket.id);
    if (!nickname) return;

    const text = String(rawText || "").trim().slice(0, MAX_MESSAGE);
    if (!text) return;

    io.emit("message", {
      senderId: socket.id,
      nickname,
      text,
      time: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    const nickname = users.get(socket.id);
    if (!nickname) return;

    users.delete(socket.id);
    io.emit("users", userList());
    io.emit("system", `${nickname}님이 나갔어요.`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
