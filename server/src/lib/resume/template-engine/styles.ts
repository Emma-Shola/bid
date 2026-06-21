import { StyleSheet } from "@react-pdf/renderer";
import { ATS_CLASSIC_TEMPLATE } from "./atsClassic";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

const { typography, composition } = ATS_CLASSIC_TEMPLATE;
const { colors, fonts } = RESUME_RENDER_TOKENS;

export const resumePdfStyles = StyleSheet.create({
  page: {
    paddingTop: composition.pagePadding,
    paddingRight: composition.pagePadding,
    paddingBottom: composition.pagePadding,
    paddingLeft: composition.pagePadding,
    fontFamily: fonts.serif,
    color: colors.body,
    fontSize: typography.bodySize,
    lineHeight: typography.lineHeight
  },
  document: {
    flexDirection: "column"
  },
  header: {
    alignItems: "flex-start",
    marginBottom: composition.headerGap,
    paddingBottom: 3.5,
    borderBottomWidth: 0.9,
    borderBottomColor: colors.rule
  },
  headerName: {
    fontFamily: fonts.sansBold,
    fontSize: typography.nameSize,
    lineHeight: 1,
    color: colors.ink,
    textAlign: "left"
  },
  headerTitle: {
    marginTop: 2,
    fontFamily: fonts.sansBold,
    fontSize: typography.titleSize,
    lineHeight: 1.01,
    color: colors.muted,
    textAlign: "left",
    letterSpacing: 0.12
  },
  headerContact: {
    marginTop: 2,
    fontFamily: fonts.sans,
    fontSize: typography.subtextSize,
    lineHeight: 1.04,
    color: colors.muted,
    textAlign: "left"
  },
  headerLinks: {
    marginTop: 0.8,
    fontFamily: fonts.sans,
    fontSize: Math.max(7.8, typography.subtextSize - 0.35),
    lineHeight: 1.03,
    color: colors.faint,
    textAlign: "left"
  },
  section: {
    marginTop: composition.sectionGap
  },
  sectionHeadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 1.75
  },
  sectionHeading: {
    fontFamily: fonts.sansBold,
    fontSize: typography.sectionHeadingSize,
    lineHeight: 1,
    color: colors.ink,
    textTransform: "uppercase",
    letterSpacing: 1.25
  },
  sectionHeadingRule: {
    flex: 1,
    marginLeft: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.rule
  },
  sectionBody: {
    marginTop: composition.sectionBodyGap
  },
  summary: {
    fontFamily: fonts.serif,
    fontSize: typography.bodySize,
    lineHeight: 1.16,
    color: colors.body,
    textAlign: "left"
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 0.55
  },
  skillLabel: {
    width: composition.labelWidth,
    flexShrink: 0,
    fontFamily: fonts.sansBold,
    fontSize: typography.bodySize - 0.2,
    lineHeight: 1.04,
    color: colors.ink
  },
  skillText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: typography.bodySize,
    lineHeight: 1.13,
    color: colors.body,
    textAlign: "left"
  },
  entry: {
    marginBottom: composition.entryGap + 0.15
  },
  entryHeader: {
    marginBottom: 0.35
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "baseline"
  },
  entryLeft: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: composition.rightColumnGap
  },
  entryRight: {
    width: composition.metaWidth,
    flexShrink: 0,
    alignItems: "flex-end"
  },
  entryRole: {
    fontFamily: fonts.sansBold,
    fontSize: 10.15,
    lineHeight: 1.03,
    color: colors.ink
  },
  entryDate: {
    fontFamily: fonts.sans,
    fontSize: 8.2,
    lineHeight: 1.03,
    color: colors.faint,
    textAlign: "right"
  },
  entryCompany: {
    fontFamily: fonts.sansBold,
    fontSize: 9.75,
    lineHeight: 1.03,
    color: colors.ink
  },
  entryLocation: {
    fontFamily: fonts.sans,
    fontSize: 8.0,
    lineHeight: 1.03,
    color: colors.faint,
    textAlign: "right"
  },
  entryBody: {
    marginTop: 1.05
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: composition.bulletGap,
    paddingLeft: composition.bulletIndent - 0.5
  },
  bulletMark: {
    width: 6,
    fontFamily: fonts.sansBold,
    fontSize: 6.35,
    lineHeight: 1.01,
    color: colors.muted
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: typography.bodySize - 0.05,
    lineHeight: 1.145,
    color: colors.body,
    textAlign: "left"
  },
  sectionSpacer: {
    height: 2
  },
  denseSpacer: {
    height: 2
  },
  emptySpace: {
    height: 3
  },
  educationDetails: {
    marginTop: 1
  },
  certificateLine: {
    marginTop: 1
  }
});


