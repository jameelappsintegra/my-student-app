import { useEffect } from "react";
import { useRouter } from "next/router";
import { Loading } from "../../components/common";

// Old address of the students list.
export default function MyClassRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/students");
  }, [router]);
  return <Loading label="Opening students…" />;
}
