import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { PageHeader } from "../../components/common";
import StudentForm, { blankStudent } from "../../components/forms/StudentForm";
import { api } from "../../services/api";

export default function NewStudent() {
  const router = useRouter();
  const [photo, setPhoto] = useState(null);
  return (
    <Layout title="Add student" back>
      <PageHeader
        title="Add student"
        subtitle="For students already at the school. New applicants should go through New Admission."
      />
      <StudentForm
        initial={blankStudent()}
        isNew
        submitLabel="Add student"
        onAadhaarPhoto={setPhoto}
        onSubmit={async (body) => {
          const res = await api.students.create(body);
          if (photo) {
            // Use the Aadhaar photo as the profile photo (re-encoded server-side).
            try {
              const blob = await (await fetch(photo)).blob();
              await api.students.uploadPhoto(res.data.id, new File([blob], "aadhaar.jpg", { type: "image/jpeg" }));
            } catch {
              // The student is saved; the photo can be added from the profile.
            }
          }
          router.replace(`/students/${res.data.id}?added=1`);
        }}
      />
    </Layout>
  );
}
