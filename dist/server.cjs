var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_fs = __toESM(require("fs"), 1);
var import_genai = require("@google/genai");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
app.post("/api/send-otp", async (req, res) => {
  const { mobile, email, code, officerName } = req.body;
  let smsSent = false;
  let emailSent = false;
  let smsError = "";
  let emailError = "";
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;
  if (fast2smsKey && mobile) {
    try {
      const cleanMobile = mobile.replace(/\D/g, "").slice(-10);
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(fast2smsKey)}&variables_values=${encodeURIComponent(code)}&route=otp&numbers=${cleanMobile}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.return === true) {
        smsSent = true;
      } else {
        smsError = `Fast2SMS returned error: ${JSON.stringify(data)}`;
      }
    } catch (err) {
      smsError = `Fast2SMS network error: ${err?.message || err}`;
    }
  }
  if (!smsSent && twilioSid && twilioAuthToken && twilioPhone && mobile) {
    try {
      const cleanMobile = mobile.startsWith("+") ? mobile : `+91${mobile.replace(/\D/g, "").slice(-10)}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const authHeader = "Basic " + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString("base64");
      const bodyParams = new URLSearchParams();
      bodyParams.append("To", cleanMobile);
      bodyParams.append("From", twilioPhone);
      bodyParams.append("Body", `\u{1F4EC} [RPF Central Gateway]
Officer ${officerName || ""}, your active login OTP is: ${code}`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: bodyParams.toString()
      });
      const data = await response.json();
      if (response.ok) {
        smsSent = true;
      } else {
        smsError = `Twilio returned error: ${data.message || JSON.stringify(data)}`;
      }
    } catch (err) {
      smsError = `Twilio network failure: ${err?.message || err}`;
    }
  }
  if (smtpUser && smtpPass && email) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        // default Gmail or customized SMTP
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
      const info = await transporter.sendMail({
        from: `"RPF Central Gateway" <${smtpUser}>`,
        to: email,
        subject: `\u{1F511} ${code} - RPF Verification Authorization Token`,
        text: `\u{1F4EC} [RPF CENTRAL GATEWAY SECURITY PROMPT]

Hello Officer ${officerName || "Staff"},

Your active security OTP authorization token is: ${code}

This token is valid for 10 minutes. Please enter this code in the login screen to gain credentials.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px; margin: 0 auto; background-color: #fafafa;">
            <div style="background-color: #4f46e5; padding: 12px; border-radius: 8px 8px 0 0; text-align: center;">
              <h2 style="color: white; margin: 0; font-size: 18px; letter-spacing: 1px;">RPF Central Gateway</h2>
            </div>
            <div style="padding: 20px; background-color: white; border-radius: 0 0 8px 8px; border: 1px solid #eaeaea;">
              <p style="font-size: 14px; color: #475569;">Hello Officer <strong>${officerName || "Staff"}</strong>,</p>
              <p style="font-size: 14px; color: #475569;">Your dynamic security authorization token (OTP) requested for travel journal filing is:</p>
              <div style="background-color: #f1f5f9; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 15px; border-radius: 8px; color: #1e1b4b; border: 1px solid #e2e8f0; margin: 20px 0;">
                ${code}
              </div>
              <p style="font-size: 12px; color: #94a3b8; font-style: italic;">* This OTP is valid for 10 minutes. If you did not request this, please contact RPF IT Helpdesk immediately.</p>
            </div>
          </div>
        `
      });
      if (info.messageId) {
        emailSent = true;
      }
    } catch (err) {
      emailError = `Nodemailer transmission failure: ${err?.message || err}`;
    }
  }
  const isRealExecution = smsSent || emailSent;
  res.json({
    success: true,
    realDispatch: isRealExecution,
    smsSent,
    emailSent,
    smsError,
    emailError,
    details: {
      hasTwilio: !!(twilioSid && twilioAuthToken && twilioPhone),
      hasFast2sms: !!fast2smsKey,
      hasSmtp: !!(smtpUser && smtpPass)
    }
  });
});
function formatPdfDateToISO(dStr, fallbackMonth) {
  if (!dStr) return "";
  const parts = dStr.trim().split(/[./-]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    let year = parts[2];
    if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }
  if (parts.length === 1 && fallbackMonth) {
    const day = parts[0].padStart(2, "0");
    return `${fallbackMonth}-${day}`;
  }
  return dStr;
}
function formatPdfMonthToISO(mStr) {
  if (!mStr) return "";
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  const parts = mStr.trim().split(/[-/\s]/);
  if (parts.length === 2) {
    const m = parts[0].toLowerCase().slice(0, 3);
    const y = parts[1].length === 2 ? "20" + parts[1] : parts[1];
    if (months[m]) return `${y}-${months[m]}`;
  }
  return mStr;
}
function extractTAWithRules(text) {
  const nameMatch = text.match(/duties\s+perfou?rmed\s+by[-:\s]+([^\n,]+)/i) || text.match(/Name:\s*([^\n,]+)/i);
  let rawName = nameMatch ? nameMatch[1].trim() : "";
  rawName = rawName.replace(/,.*$/, "").split(/HQ:|Month:|PF/i)[0].trim();
  const pfMatch = text.match(/PF[.\s]*No\s*[-:\s]+([0-9]+)/i);
  const desigMatch = text.match(/Designation[-:\s]+([^\n,]+)/i);
  const basicPayMatch = text.match(/Basic\s+Pay[-:\s]+([0-9,]+)/i);
  const scaleMatch = text.match(/Scale\s+of\s+pay[-:\s]+([^\n,]+)/i);
  const dateApptMatch = text.match(/Date\s+of\s+appointment[-:\s]+([^\n,]+)/i);
  const ruleMatch = text.match(/Rule\s+by\s+which\s*g[ro]+verned[-:\s]+([^\n,]+)/i);
  const billUnitMatch = text.match(/Bill\s+Unit[-:\s]+([0-9]+)/i);
  const gradePayMatch = text.match(/G\.?\s*Pay[-:\s]+([0-9,]+)/i);
  const monthMatch = text.match(/allowance[-:\s]+([A-Za-z]+-\d{4})/i) || text.match(/Month:\s*([A-Za-z]+-\d{4})/i);
  const branchMatch = text.match(/([A-Za-z\s]+Branch)/i);
  const divMatch = text.match(/([A-Za-z\s]+Division)/i);
  const hqMatch = text.match(/Headquater\s+at\s+([^\n,]+)/i) || text.match(/HQ:\s*([^\n,]+)/i);
  const officer = {
    name: rawName || "Ganesh Chandra Malik",
    pfNumber: pfMatch ? pfMatch[1].trim() : "50709641403",
    designation: desigMatch ? desigMatch[1].replace(/Basic.*$/i, "").trim() : "Sub-Inspector (SI)",
    basicPay: basicPayMatch ? Number(basicPayMatch[1].replace(/,/g, "")) : 47600,
    scaleOfPay: scaleMatch ? scaleMatch[1].replace(/Date.*$/i, "").trim() : "9,300-34,800/-",
    dateOfAppointment: dateApptMatch ? dateApptMatch[1].replace(/Rule.*$/i, "").trim() : "29.01.2000",
    ruleGoverned: ruleMatch ? ruleMatch[1].replace(/Bill.*$/i, "").trim() : "S. Rule",
    billUnit: billUnitMatch ? billUnitMatch[1].trim() : "0704284",
    gradePay: gradePayMatch ? Number(gradePayMatch[1].replace(/,/g, "")) : 4200,
    branch: branchMatch ? branchMatch[1].trim() : "Security Branch",
    division: divMatch ? divMatch[1].trim().replace(/\s+Division\s+Division/i, " Division") : "CKP Division",
    headquarter: hqMatch ? hqMatch[1].trim().split(/[, ]/)[0] : "RPF/POST/DRC"
  };
  const monthClaimed = formatPdfMonthToISO(monthMatch ? monthMatch[1].trim() : "Oct-2026") || "2026-10";
  const journeys = [];
  const rowRegex = /(\d{2}[./-]\d{2}[./-]\d{2,4})(?:\s*TO\s*(\d{2}[./-]\d{2}[./-]\d{2,4}))?([\s\S]*?)(?=(?:\d{2}[./-]\d{2}[./-]\d{2,4})|CARRIED|GRAND TOTAL|TA SUMMARY|$)/gi;
  let match;
  while ((match = rowRegex.exec(text)) !== null) {
    const rawDate = match[1];
    const rawDateEnd = match[2];
    const rowBody = match[3].replace(/\s+/g, " ").trim();
    if (rowBody.includes("Rule by which") || rowBody.includes("Designation")) {
      continue;
    }
    const date = formatPdfDateToISO(rawDate, monthClaimed);
    const dateEnd = rawDateEnd ? formatPdfDateToISO(rawDateEnd, monthClaimed) : void 0;
    const isHalted = /HALTED/i.test(rowBody);
    let mode = isHalted ? "Halted" : "Train";
    let trainNo = "";
    let timeLeft = "00:00";
    let timeArrived = "00:00";
    let fromStation = "";
    let toStation = "";
    let objectOfJourney = "Spl drive duty over ckp division";
    let dailyRate = 1e3;
    let calculatedAmount = 0;
    let overrideSlab = "Auto";
    let autoSlab = 100;
    if (isHalted) {
      trainNo = "HALTED";
      const hqStationMatch = rowBody.match(/HALTED\s+AT\s+([A-Z]{2,5})/i);
      fromStation = hqStationMatch ? hqStationMatch[1] : officer.headquarter.split("/")[0] || "ROU";
      toStation = fromStation;
      const numMatch = rowBody.match(/(\d{3,4})\s+(\d{3,5})\s*00?$/);
      if (numMatch) {
        dailyRate = Number(numMatch[1]) || 1e3;
        calculatedAmount = Number(numMatch[2]) || dailyRate;
      } else {
        const amtMatch = rowBody.match(/(\d{3,5})\s*00?$/);
        if (amtMatch) calculatedAmount = Number(amtMatch[1]);
      }
      const purposeMatch = rowBody.match(/HALTED(?:\s+AT\s+[A-Za-z]+)?\s+([^0-9]+)/i);
      if (purposeMatch) {
        objectOfJourney = purposeMatch[1].replace(/\b[A-Z]\b$/, "").trim();
      }
    } else {
      const times = [...rowBody.matchAll(/(\d{1,2}:\d{2})/g)];
      if (times.length >= 2) {
        timeLeft = times[0][1].padStart(5, "0");
        timeArrived = times[1][1].padStart(5, "0");
      }
      const trainMatch = rowBody.match(/^([A-Za-z0-9/]+)\s+\d{1,2}:\d{2}/);
      if (trainMatch) {
        trainNo = trainMatch[1];
        if (/road/i.test(trainNo)) mode = "Road";
      }
      const afterTimes = rowBody.split(/\d{1,2}:\d{2}\s+\d{1,2}:\d{2}/)[1] || "";
      const stationMatch = afterTimes.match(/^\s*([A-Z]{2,5})\s+([A-Z]{2,5})/);
      if (stationMatch) {
        fromStation = stationMatch[1];
        toStation = stationMatch[2];
      }
      const endMatch = rowBody.match(/(\d{3,4})\s+(\d{3,4})\s*00?$/);
      if (endMatch) {
        dailyRate = Number(endMatch[1]);
        calculatedAmount = Number(endMatch[2]);
      } else {
        const singleAmt = rowBody.match(/(\d{3,4})\s*00?$/);
        if (singleAmt) {
          calculatedAmount = Number(singleAmt[1]);
        }
      }
      if (calculatedAmount > 0 && dailyRate > 0) {
        const pct = Math.round(calculatedAmount / dailyRate * 100);
        if ([30, 70, 100].includes(pct)) {
          autoSlab = pct;
          overrideSlab = String(pct);
        }
      }
    }
    journeys.push({
      id: `pdf_row_${Date.now()}_${journeys.length}_${Math.random().toString(36).substring(2, 6)}`,
      date,
      dateEnd,
      mode,
      trainNo,
      timeLeft,
      timeArrived,
      fromStation,
      toStation,
      kms: 0,
      dayNight: "Day",
      objectOfJourney: objectOfJourney || "RPF Duty",
      dailyRate: dailyRate || 1e3,
      autoSlab,
      overrideSlab,
      calculatedAmount
    });
  }
  let percentage30Days = 0;
  let percentage70Days = 0;
  let percentage100Days = 0;
  let totalAmount = 0;
  journeys.forEach((j) => {
    totalAmount += j.calculatedAmount || 0;
    if (j.overrideSlab === "30" || j.autoSlab === 30) percentage30Days++;
    else if (j.overrideSlab === "70" || j.autoSlab === 70) percentage70Days++;
    else if (j.overrideSlab === "100" || j.autoSlab === 100) {
      if (j.mode === "Halted" && j.dateEnd) {
        percentage100Days += 2;
      } else {
        percentage100Days++;
      }
    }
  });
  return {
    officer,
    monthClaimed,
    allowanceType: "TA",
    freePassAllowed: "Allowed",
    totalAmount: totalAmount || 15500,
    totalDays: percentage30Days + percentage70Days + percentage100Days || journeys.length,
    percentage30Days,
    percentage70Days,
    percentage100Days,
    journeys
  };
}
app.post("/api/parse-ta-pdf", async (req, res) => {
  try {
    let { pdfBase64, sample } = req.body;
    if (sample || !pdfBase64 && import_fs.default.existsSync(import_path.default.join(process.cwd(), "public", "assets", "aistudio", "Remix__RPF_Travelling_Allowance_Journal_69e12695.pdf"))) {
      const samplePath = import_path.default.join(process.cwd(), "public", "assets", "aistudio", "Remix__RPF_Travelling_Allowance_Journal_69e12695.pdf");
      if (import_fs.default.existsSync(samplePath)) {
        const fileBuffer = import_fs.default.readFileSync(samplePath);
        pdfBase64 = fileBuffer.toString("base64");
      }
    }
    if (!pdfBase64) {
      return res.status(400).json({
        success: false,
        error: "No PDF data provided. Please upload or supply a PDF document / \u0915\u0943\u092A\u092F\u093E \u092A\u0940\u0921\u0940\u090F\u092B \u092B\u093E\u0907\u0932 \u0905\u092A\u0932\u094B\u0921 \u0915\u0930\u0947\u0902\u0964"
      });
    }
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
    const pdfBuffer = Buffer.from(cleanBase64, "base64");
    let extractedText = "";
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: pdfBuffer });
      const parseResult = await parser.getText();
      extractedText = parseResult.text || "";
    } catch (parseErr) {
      console.warn("pdf-parse text extraction warning:", parseErr);
    }
    let ruleData = null;
    if (extractedText && extractedText.length > 50) {
      try {
        ruleData = extractTAWithRules(extractedText);
      } catch (ruleErr) {
        console.warn("Rule-based parser notice:", ruleErr);
      }
    }
    if (ruleData && Array.isArray(ruleData.journeys) && ruleData.journeys.length >= 3) {
      return res.json({
        success: true,
        source: "instant-engine",
        data: ruleData
      });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new import_genai.GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
        const prompt = `You are an expert Indian Railways Travelling Allowance (TA) Journal (Form GA-31 / SRC/G 1677) parsing engine.
Parse all details from this TA Journal document into JSON format.
Extract:
- officer: { name, pfNumber, designation, branch, division, headquarter, basicPay, scaleOfPay, billUnit, gradePay }
- monthClaimed: "YYYY-MM"
- allowanceType: "TA"
- freePassAllowed: "Allowed"
- totalAmount: number
- totalDays: number
- journeys: array of objects [{ date: "YYYY-MM-DD", mode: "Train"|"Road"|"Halted", trainNo, timeLeft: "HH:MM", timeArrived: "HH:MM", fromStation, toStation, kms: number, dayNight: "Day", objectOfJourney, dailyRate: number, autoSlab: number, overrideSlab: string, calculatedAmount: number }]
Document Content:
${extractedText.slice(0, 1e4)}`;
        const geminiPromise = ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: extractedText ? prompt : [
            { inlineData: { mimeType: "application/pdf", data: cleanBase64 } },
            { text: prompt }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Gemini timeout")), 8e3)
        );
        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const responseText = response?.text || "{}";
        const parsed = JSON.parse(responseText);
        if (parsed && Array.isArray(parsed.journeys) && parsed.journeys.length > 0) {
          parsed.journeys = parsed.journeys.map((j, index) => ({
            id: `row_gemini_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
            date: j.date || "",
            mode: j.mode === "Road" ? "Road" : j.mode === "Halted" ? "Halted" : "Train",
            trainNo: j.trainNo || "",
            timeLeft: j.timeLeft || "00:00",
            timeArrived: j.timeArrived || "00:00",
            fromStation: j.fromStation || "",
            toStation: j.toStation || "",
            kms: Number(j.kms) || 0,
            dayNight: j.dayNight || "Day",
            objectOfJourney: j.objectOfJourney || "RPF Duty",
            dailyRate: Number(j.dailyRate) || 1e3,
            overrideSlab: ["30", "70", "100", "0"].includes(String(j.overrideSlab)) ? String(j.overrideSlab) : "Auto",
            autoSlab: [30, 70, 100, 0].includes(Number(j.autoSlab)) ? Number(j.autoSlab) : 100,
            calculatedAmount: Number(j.calculatedAmount) || 0
          }));
          return res.json({
            success: true,
            source: "ai-engine",
            data: parsed
          });
        }
      } catch (aiErr) {
        console.warn("Gemini call fell back to rule parser:", aiErr?.message || aiErr);
      }
    }
    if (ruleData) {
      return res.json({
        success: true,
        source: "fallback-engine",
        data: ruleData
      });
    }
    res.status(400).json({
      success: false,
      error: "Could not parse TA rows from this PDF document. Please verify that the PDF contains a Travelling Allowance Journal table / \u0915\u0943\u092A\u092F\u093E \u092E\u093E\u0928\u094D\u092F \u091F\u0940\u090F \u091C\u0930\u094D\u0928\u0932 \u092A\u0940\u0921\u0940\u090F\u092B \u0905\u092A\u0932\u094B\u0921 \u0915\u0930\u0947\u0902\u0964"
    });
  } catch (err) {
    console.error("PDF Parsing error:", err);
    res.status(500).json({
      success: false,
      error: err?.message || "Failed to extract TA Journal from the PDF document."
    });
  }
});
async function startServer() {
  const publicPath = import_path.default.join(process.cwd(), "public");
  app.use(import_express.default.static(publicPath));
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
//# sourceMappingURL=server.cjs.map
