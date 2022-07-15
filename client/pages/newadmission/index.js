import Layout from "../../components/layout/layout";
import Datepicker from "react-datepicker";
import { useState } from "react";
import "react-datepicker/dist/react-datepicker.css";

// CSS Modules, react-datepicker-cssmodules.css
import "react-datepicker/dist/react-datepicker-cssmodules.css";

const Newadmisison = () => {
  const [dateofBirth, setDateofBirth] = useState(new Date());
  return (
    <>
      <Layout>
        <h2 className="text-2xl">New Admission</h2>
        <h2 className="text-md">Student Details</h2>
        <div>
          <div className="my-4">
            <input
              type="text"
              placeholder="Full Name"
              class="input w-full max-w-xs"
            />
          </div>
          <div className="my-4">
            <Datepicker
              selected={dateofBirth}
              //   onChange={(date: Date) => setDateofBirth(date)}
            />
          </div>
          <div className="my-4">
            <div class="form-control w-full max-w-xs">
              <label class="label">
                <span class="label-text">Select Class</span>
              </label>
            </div>
            <select class="select select-bordered">
              <option>LKG</option>
              <option>UKG</option>
              <option>First Standard</option>
              <option>Second Standard</option>
              <option>Third Standard</option>
              <option>Fourth Standard</option>
              <option>Fifth Standard</option>
              <option>Sixth Standard</option>
              <option>Seventh Standard</option>
              <option>Eigth Standard</option>
              <option>Nineth Standard</option>
              <option>Tenth Standard</option>
              <option>Eleventh Standard</option>
              <option>Tevelvth Standard</option>
            </select>
          </div>
        </div>
        <div className="my-4">
          <input
            type="text"
            placeholder="Father Name"
            class="input w-full max-w-xs"
          />
        </div>
        <div className="my-4">
          <input
            type="text"
            placeholder="Mother Name"
            class="input w-full max-w-xs"
          />
        </div>
        <div className="my-4">
          <textarea
            placeholder="Student Address"
            class="input w-full max-w-xs min-h-16"
          ></textarea>
        </div>
      </Layout>
    </>
  );
};

export default Newadmisison;
