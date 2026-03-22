export type PatientStatus = "Pending" | "In Progress" | "Updated";

export interface Patient {
  id: string;
  name: string;
  room: string;
  mrn: string;
  dob: string;
  sex: "M" | "F";
  status: PatientStatus;
  lastNote: string;
  pinned: boolean;
}

export interface IcdCode {
  code: string;
  description: string;
  mapped: string;
}

export const patients: Patient[] = [
  {
    id: "john-d",
    name: "John D.",
    room: "401A",
    mrn: "8839210",
    dob: "05/12/1958",
    sex: "M",
    status: "Pending",
    lastNote: "4h ago",
    pinned: true,
  },
  {
    id: "gary-bailey",
    name: "Jane S.",
    room: "402B",
    mrn: "9201445",
    dob: "11/22/1982",
    sex: "F",
    status: "In Progress",
    lastNote: "Live Session",
    pinned: false,
  },
  {
    id: "mark-v",
    name: "Mark V.",
    room: "415C",
    mrn: "1120934",
    dob: "08/04/1971",
    sex: "M",
    status: "Updated",
    lastNote: "12:45 PM",
    pinned: false,
  },
  {
    id: "raymond-t",
    name: "Raymond T.",
    room: "218A",
    mrn: "4409123",
    dob: "01/15/1965",
    sex: "M",
    status: "Pending",
    lastNote: "Mar 21",
    pinned: true,
  },
  {
    id: "alkabili-n",
    name: "Alkabili N.",
    room: "302D",
    mrn: "5561023",
    dob: "09/30/1990",
    sex: "F",
    status: "Pending",
    lastNote: "Mar 21",
    pinned: false,
  },
  {
    id: "maria-dejesus",
    name: "Maria Dejesus",
    room: "505A",
    mrn: "3321490",
    dob: "12/03/1945",
    sex: "F",
    status: "Updated",
    lastNote: "Mar 19",
    pinned: false,
  },
];

export const garyBaileyNote = {
  patient: {
    name: "Gary T. Bailey",
    room: "402-A",
    age: 75,
    sex: "MALE",
    mrn: "00-114-8823",
    dob: "02/14/1951",
  },
  yesterday: {
    date: "Oct 23 • 08:15 AM",
    subjective:
      "Patient reports mild discomfort in laryngeal region. Sleep quality improved slightly.",
    problems: [
      {
        label: "Laryngeal carcinoma",
        text: "Continuing current pain management. Plan to change to home oxycodone 5mg.",
      },
      {
        label: "Anemia",
        text: "Hgb 7.9. Plan to transfuse 1u pRBCs today and monitor.",
      },
      {
        label: "HTN/pAF",
        text: "Maintaining current metoprolol dose. Rivaroxaban held for biopsy.",
      },
    ],
    social: "Discharge planning initiated. Family supportive.",
  },
  today: {
    subjective:
      "Patient reports mild discomfort in laryngeal region. Sleep quality improved slightly.",
    changes: [
      {
        id: "oxycodone",
        label: "Laryngeal carcinoma",
        prefix: "Continuing current pain management. Plan to ",
        deletion: "change to home oxycodone 5mg.",
        addition: "titrate oxycodone to 10mg.",
        suffix: "",
      },
      {
        id: "anemia",
        label: "Anemia",
        prefix: "",
        deletion: "Hgb 7.9. Plan to transfuse 1u pRBCs today and monitor.",
        addition: "Hgb 8.2. Hemoglobin stable at 8.2, no transfusion needed.",
        suffix: "",
      },
      {
        id: "htn",
        label: "HTN/pAF",
        prefix: "Maintaining current metoprolol dose. ",
        deletion: "Rivaroxaban held for biopsy.",
        addition: "+ restart rivaroxaban today.",
        suffix: "",
      },
    ],
    social: "Discharge planning initiated. Family supportive.",
  },
  icdCodes: [
    {
      code: "C32.9",
      description: "Malignant neoplasm of larynx, unspecified",
      mapped: "#Laryngeal carcinoma",
    },
    {
      code: "D64.9",
      description: "Anemia, unspecified",
      mapped: "#Anemia",
    },
    {
      code: "I10",
      description: "Essential hypertension",
      mapped: "#HTN",
    },
  ],
};
