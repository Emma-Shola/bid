import ExcelJS from "exceljs";
import { guessJobSite, isLikelySpanish, type ResumeReportRow } from "./resume-report";

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function formatSlashDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

const STATUS_OPTIONS = ["Applied", "Rejected", "1st Screen", "Assessment", "Failed", "Offer"];

const STATUS_COLORS: Record<string, string> = {
  Applied: "FFFFF2CC",
  Rejected: "FFF4C7C3",
  "1st Screen": "FFD9EAD3",
  Assessment: "FFD9EAD3",
  Failed: "FFF4C7C3",
  Offer: "FFCFE2F3"
};

const HEADER_FILL = "FF4472C4";

export async function buildResumeReportWorkbook(rows: ResumeReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resume activity");

  const columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "No", key: "no", width: 6 },
    { header: "Job site", key: "jobSite", width: 14 },
    { header: "Language", key: "language", width: 12 },
    { header: "Company", key: "company", width: 22 },
    { header: "Job Title", key: "jobTitle", width: 32 },
    { header: "Job Link", key: "jobLink", width: 40 },
    { header: "Location", key: "location", width: 14 },
    { header: "Browser", key: "browser", width: 14 },
    { header: "ATS Score", key: "atsScore", width: 10 },
    { header: "Applied Date", key: "appliedDate", width: 14 },
    { header: "Job posted", key: "jobPosted", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Bidded by", key: "biddedBy", width: 16 },
    { header: "Notes", key: "notes", width: 30 }
  ];

  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 20;

  // Group consecutive rows by calendar day so the Date column can be merged
  // down each day's block, matching the template's grouped-date layout.
  const groups: ResumeReportRow[][] = [];
  for (const row of rows) {
    const dayKey = formatDayKey(row.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && formatDayKey(lastGroup[0].createdAt) === dayKey) {
      lastGroup.push(row);
    } else {
      groups.push([row]);
    }
  }

  let excelRowIndex = 2;
  const statusColumnLetter = "M";
  const statusValidationRange = STATUS_OPTIONS.join(",");

  for (const group of groups) {
    const groupStartRow = excelRowIndex;

    group.forEach((row, indexInGroup) => {
      const spanish = isLikelySpanish(row.jobDescription);
      const excelRow = sheet.getRow(excelRowIndex);

      excelRow.getCell("A").value = indexInGroup === 0 ? formatShortDate(row.createdAt) : "";
      excelRow.getCell("B").value = indexInGroup + 1;
      excelRow.getCell("C").value = guessJobSite(row.jobUrl);
      excelRow.getCell("D").value = spanish ? "Spanish" : "English";
      excelRow.getCell("E").value = row.company;
      excelRow.getCell("E").font = { bold: true };
      excelRow.getCell("F").value = row.jobTitle;
      excelRow.getCell("F").font = { bold: true };

      if (row.jobUrl) {
        excelRow.getCell("G").value = { text: row.jobUrl, hyperlink: row.jobUrl };
        excelRow.getCell("G").font = { color: { argb: "FF1155CC" }, underline: true };
      }

      excelRow.getCell("H").value = spanish ? "Argentina" : "";
      excelRow.getCell("I").value = "";
      excelRow.getCell("J").value = row.score ?? "";
      excelRow.getCell("K").value = formatSlashDate(row.appliedAt);
      excelRow.getCell("L").value = "";

      const statusCell = excelRow.getCell(statusColumnLetter);
      statusCell.value = "Applied";
      statusCell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${statusValidationRange}"`]
      };
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_COLORS.Applied } };

      excelRow.getCell("N").value = row.bidderName;
      excelRow.getCell("O").value = "";

      excelRowIndex += 1;
    });

    if (group.length > 1) {
      sheet.mergeCells(`A${groupStartRow}:A${excelRowIndex - 1}`);
    }
  }

  // Conditional formatting so a manually-changed Status dropdown re-colors its
  // own row, since every row starts as a uniform "Applied" at export time.
  if (rows.length > 0) {
    const lastRow = excelRowIndex - 1;
    for (const [status, color] of Object.entries(STATUS_COLORS)) {
      sheet.addConditionalFormatting({
        ref: `${statusColumnLetter}2:${statusColumnLetter}${lastRow}`,
        rules: [
          {
            type: "cellIs",
            operator: "equal",
            formulae: [`"${status}"`],
            style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: color } } },
            priority: 1
          }
        ]
      });
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
