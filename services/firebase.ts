
// DECLARE AS CREDENCIAIS DO SEU PROJETO FIREBASE AQUI
// Você as obtém no Console do Firebase > Configurações do Projeto
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "ID",
  appId: "APP_ID"
};

// @ts-ignore
if (!firebase.apps.length) {
  // @ts-ignore
  firebase.initializeApp(firebaseConfig);
}

// @ts-ignore
export const db = firebase.database();
