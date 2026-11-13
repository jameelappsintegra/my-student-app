import "../styles/globals.scss";
import "react-datepicker/dist/react-datepicker.css";
import { AuthProvider } from "../context/auth";

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;
