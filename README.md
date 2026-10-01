# 실시간 채팅 앱

닉네임으로 입장해서 여러 명이 함께 쓰는 채팅 앱이에요. (Node.js, Express, Socket.io)

- 입장할 때 닉네임 설정
- 내 메시지는 오른쪽, 다른 사람 메시지는 왼쪽
- 접속자 목록 확인

## 로컬에서 실행

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 을 열어요. 탭을 두 개 열면 서로 채팅해 볼 수 있어요.

## GitHub에 올리기

```bash
git init
git add .
git commit -m "채팅 앱 첫 커밋"
git branch -M main
git remote add origin https://github.com/<내-아이디>/<저장소-이름>.git
git push -u origin main
```

## Railway로 배포하기

1. railway.com 에 GitHub 계정으로 로그인해요.
2. **New Project → Deploy from GitHub repo** 에서 위 저장소를 선택해요.
3. 배포가 끝나면 서비스의 **Settings → Networking → Generate Domain** 을 눌러요.
4. 생성된 주소로 접속하면 끝이에요.

별도 설정은 필요 없어요. Railway가 `npm start`로 실행하고 `PORT`는 자동으로 넣어줘요.
이후 `git push` 할 때마다 자동으로 다시 배포돼요.

## 참고

- 접속자와 메시지는 서버 메모리에만 있어서, 서버가 재시작되면 사라져요.
- 서버를 여러 개로 늘리면 접속자 목록이 나뉘어요. 인스턴스 1개로 쓰세요.
