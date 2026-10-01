const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { containsBadWord, normalize } = require("./badwords");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_NICKNAME = "박준우";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""; // Railway Variables 에서 설정
const KICK_MS = (Number(process.env.KICK_MINUTES) || 10) * 60 * 1000;
const MAX_NICKNAME = 12;
const MAX_MESSAGE = 500;
const SPAM_LIMIT = 5; // SPAM_WINDOW_MS 안에 이 개수를 넘기면 도배
const SPAM_WINDOW_MS = 5000;
const DUP_WINDOW_MS = 15000; // 같은 말을 이 시간 안에 3번 보내면 도배
const MAX_DELETED = 200;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => res.send("ok"));

const users = new Map(); // socket.id -> { nickname, isAdmin }
const deleted = new Map(); // 메시지 id -> 삭제된 메시지
const bannedIps = new Map(); // ip -> 풀리는 시각
let nextMsgId = 1;

const squash = (s) => s.replace(/\s+/g, "");
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const passwordOk = (input) =>
  ADMIN_PASSWORD !== "" && crypto.timingSafeEqual(sha(String(input || "")), sha(ADMIN_PASSWORD));

function userList() {
  return [...users.entries()].map(([id, u]) => ({ id, nickname: u.nickname, isAdmin: u.isAdmin }));
}

function isNicknameTaken(nickname) {
  const target = nickname.toLowerCase();
  return [...users.values()].some((u) => u.nickname.toLowerCase() === target);
}

function emitToAdmins(event, payload) {
  for (const [id, u] of users) if (u.isAdmin) io.to(id).emit(event, payload);
}

function getIp(socket) {
  const xff = socket.handshake.headers["x-forwarded-for"];
  return xff ? String(xff).split(",")[0].trim() : socket.handshake.address;
}

function banMinutesLeft(ip) {
  const until = bannedIps.get(ip);
  if (!until) return 0;
  if (until <= Date.now()) {
    bannedIps.delete(ip);
    return 0;
  }
  return Math.ceil((until - Date.now()) / 60000);
}

function storeDeleted(msg) {
  deleted.set(msg.id, msg);
  if (deleted.size > MAX_DELETED) deleted.delete(deleted.keys().next().value);
  emitToAdmins("deleted", msg);
}

// 문제가 있으면 이유(문자열)를, 없으면 null 을 돌려줘요.
function findViolation(socket, text) {
  const now = Date.now();
  const d = socket.data;
  d.times = (d.times || []).filter((t) => now - t < SPAM_WINDOW_MS);
  d.times.push(now);
  d.texts = (d.texts || []).filter((x) => now - x.time < DUP_WINDOW_MS);
  const key = normalize(text) || text;
  const dupCount = d.texts.filter((x) => x.key === key).length;
  d.texts.push({ key, time: now });

  if (containsBadWord(text)) return "부적절한 표현";
  if (d.times.length > SPAM_LIMIT) return "도배";
  if (dupCount >= 2) return "도배";
  if (/(.)\1{19,}/u.test(text)) return "도배";
  return null;
}

io.on("connection", (socket) => {
  socket.on("join", (rawNickname, rawPassword, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};

    const left = banMinutesLeft(getIp(socket));
    if (left) return reply({ ok: false, error: `강퇴된 상태예요. ${left}분 뒤에 다시 들어올 수 있어요.` });

    if (users.has(socket.id)) {
      const u = users.get(socket.id);
      return reply({ ok: true, id: socket.id, nickname: u.nickname, isAdmin: u.isAdmin });
    }

    let nickname = String(rawNickname || "").trim().slice(0, MAX_NICKNAME);
    if (!nickname) return reply({ ok: false, error: "닉네임을 입력해 주세요." });

    let isAdmin = false;
    if (squash(nickname) === ADMIN_NICKNAME) {
      if (!ADMIN_PASSWORD) {
        return reply({ ok: false, error: "사용할 수 없는 닉네임이에요." });
      }
      if (!rawPassword) {
        return reply({ ok: false, needPassword: true, error: "개발자 비밀번호를 입력해 주세요." });
      }
      if (!passwordOk(rawPassword)) {
        socket.data.failedAdmin = (socket.data.failedAdmin || 0) + 1;
        if (socket.data.failedAdmin >= 5) socket.disconnect(true);
        return reply({ ok: false, needPassword: true, error: "비밀번호가 맞지 않아요." });
      }
      isAdmin = true;
      nickname = ADMIN_NICKNAME;
    } else if (containsBadWord(nickname)) {
      return reply({ ok: false, error: "사용할 수 없는 닉네임이에요." });
    }

    if (isNicknameTaken(nickname)) {
      return reply({ ok: false, error: "이미 사용 중인 닉네임이에요." });
    }

    users.set(socket.id, { nickname, isAdmin });
    reply({ ok: true, id: socket.id, nickname, isAdmin });

    if (isAdmin) socket.emit("deletedList", [...deleted.values()]);
    io.emit("users", userList());
    socket.broadcast.emit("system", `${nickname}님이 들어왔어요.`);
  });

  socket.on("message", (rawText) => {
    const user = users.get(socket.id);
    if (!user) return;

    const text = String(rawText || "").trim().slice(0, MAX_MESSAGE);
    if (!text) return;

    const msg = {
      id: nextMsgId++,
      senderId: socket.id,
      nickname: user.nickname,
      isAdmin: user.isAdmin,
      text,
      time: Date.now(),
    };

    if (!user.isAdmin) {
      const reason = findViolation(socket, text);
      if (reason) {
        storeDeleted({ ...msg, reason });
        return socket.emit("blocked", reason);
      }
    }
    io.emit("message", msg);
  });

  // 개발자 전용: 삭제된 메시지 복구
  socket.on("restore", (id) => {
    if (!users.get(socket.id)?.isAdmin) return;
    const msg = deleted.get(id);
    if (!msg) return;
    deleted.delete(id);
    const { reason, ...rest } = msg;
    io.emit("message", { ...rest, restored: true });
    emitToAdmins("deletedRemoved", id);
  });

  // 개발자 전용: 강퇴 (IP 기준으로 KICK_MS 동안 입장 차단)
  socket.on("kick", (targetId) => {
    if (!users.get(socket.id)?.isAdmin) return;
    const target = users.get(targetId);
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!target || !targetSocket || target.isAdmin || targetId === socket.id) return;

    bannedIps.set(getIp(targetSocket), Date.now() + KICK_MS);
    targetSocket.data.kicked = true;
    targetSocket.emit("kicked", { minutes: Math.round(KICK_MS / 60000) });
    targetSocket.disconnect(true);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (!user) return;

    users.delete(socket.id);
    io.emit("users", userList());
    io.emit("system", socket.data.kicked ? `${user.nickname}님이 강퇴됐어요.` : `${user.nickname}님이 나갔어요.`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
