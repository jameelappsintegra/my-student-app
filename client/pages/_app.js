import "../styles/globals.scss";
import "react-datepicker/dist/react-datepicker.css";
import Head from "next/head";
import { AuthProvider } from "../context/auth";

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Head>
        {/* viewport-fit=cover lets the app bar and tabs sit under phone notches. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;
