import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { PageHeader } from "../../components/common";
import StudentForm, { blankStudent } from "../../components/forms/StudentForm";
import { api } from "../../services/api";

export default function NewStudent() {
  const router = useRouter();
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
        onSubmit={async (body) => {
          const res = await api.students.create(body);
          router.replace(`/students/${res.data.id}?added=1`);
        }}
      />
    </Layout>
  );
}
