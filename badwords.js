// 금지어 목록이에요. 단어를 추가하거나 지우면 돼요.
// 검사할 때 띄어쓰기와 특수문자는 무시해요. ("시 발", "시.발" 도 걸러져요)
const BAD_WORDS = [
  "시발", "씨발", "씨바", "씨팔", "시팔", "ㅅㅂ", "ㅆㅂ",
  "병신", "븅신", "ㅂㅅ", "개새끼", "개세끼", "지랄", "ㅈㄹ",
  "좆", "존나", "미친놈", "미친년", "느금", "니애미", "니애비",
  "창녀", "한남충", "김치녀", "맘충", "틀딱",
  "fuck", "shit", "bitch", "asshole",
];

function normalize(text) {
  return String(text).toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
}

function containsBadWord(text) {
  const n = normalize(text);
  return BAD_WORDS.some((w) => n.includes(w));
}

module.exports = { containsBadWord, normalize };
