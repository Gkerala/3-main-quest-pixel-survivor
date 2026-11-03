// 공개 설정. 비밀값은 여기에 넣지 않는다 (이 파일은 누구나 볼 수 있다)
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API_BASE = local ? 'http://localhost:3000' : 'https://pixel-survivor-api.onrender.com'; // 배포 주소는 5단계에서 확정
export const GOOGLE_CLIENT_ID = '450918458558-vmvbfohuhqchm92j5ok9mr9afi0h9pid.apps.googleusercontent.com';
