
// DECLARE AS CREDENCIAIS DO SEU PROJETO FIREBASE AQUI
// Você as obtém no Console do Firebase > Configurações do Projeto
const firebaseConfig = {
 apiKey: "AIzaSyBL8Nh5v9gy6w2NjK8foZi18t-vK31KRf0",
  authDomain: "chess-d6bcf.firebaseapp.com",
  databaseURL: "https://chess-d6bcf-default-rtdb.firebaseio.com",
  projectId: "chess-d6bcf",
  storageBucket: "chess-d6bcf.firebasestorage.app",
  messagingSenderId: "720408733866",
  appId: "1:720408733866:web:ce6899c215c9c50b16c8d3"
};

// @ts-ignore
if (!firebase.apps.length) {
  // @ts-ignore
  firebase.initializeApp(firebaseConfig);
}

// @ts-ignore
export const db = firebase.database();
