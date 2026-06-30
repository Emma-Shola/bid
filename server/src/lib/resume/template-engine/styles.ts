/**
 * Single source of truth for all PDF layout styles.
 *
 * Spacing rules:
 *  1. Every measurement comes from RESUME_RENDER_TOKENS — no hardcoded numbers.
 *  2. Vertical rhythm: use ONLY marginBottom on children (never mix marginTop
 *     and marginBottom on adjacent siblings — Yoga does not collapse margins).
 *  3. Exception: section.marginTop creates the inter-section gap.
 *  4. ONE lineHeight (ty.lineHeight = 1.25) for all body text.
 *
 * Spacing contract:
 *  header.marginBottom  (8)  +  section.marginTop  (4)  = 12pt header→first section
 *  entry.marginBottom   (8)  +  section.marginTop  (4)  = 12pt between sections
 *  entry.marginBottom   (8)  between experience entries
 *  bulletsWrap.marginTop (4) from company line to first bullet
 *  bulletRow.marginBottom (2) between bullets
 *  skillRow.marginBottom  (2) between skill rows
 */

import { StyleSheet } from "@react-pdf/renderer";
import { RESUME_RENDER_TOKENS as T } from "@/resume-rendering";

const sp   = T.spacing;
const ty   = T.typography;
const comp = T.composition;
const { colors, fonts } = T;

export const resumePdfStyles = StyleSheet.create({

  // ── Page ──────────────────────────────────────────────────────────────────
  page: {
    paddingTop:      comp.pagePadding,
    paddingRight:    comp.pagePadding,
    paddingBottom:   comp.pagePadding,
    paddingLeft:     comp.pagePadding,
    fontFamily:      fonts.sans,
    color:           colors.body,
    fontSize:        ty.bodySize,
    lineHeight:      ty.lineHeight,
    backgroundColor: colors.page,
  },
  document: {
    flexDirection: "column",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    marginBottom: comp.headerGap,     // 8pt → combined with section.marginTop(4) = 12pt gap
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems:   "center",
    marginBottom:  sp.sm,             // 4pt: name/title row → rule
  },
  headerNameCol: {
    flex:         1,
    paddingRight: sp.md,              // 8pt breathing room before title column
  },
  headerTitleCol: {
    flexShrink:  0,
    maxWidth:    200,
    alignItems:  "flex-end",
  },
  headerName: {
    fontFamily: fonts.sansBold,
    fontSize:   ty.nameSize,          // 24pt
    lineHeight: 1.1,                  // display text — tighter than body
    color:      colors.ink,
  },
  headerTitle: {
    fontFamily: fonts.sansBoldItalic,
    fontSize:   ty.titleSize,         // 10pt
    lineHeight: 1.2,
    color:      colors.accent,
    textAlign:  "right",
  },
  headerRule: {
    borderBottomWidth: 0.85,
    borderBottomColor: colors.rule,
    marginBottom:      sp.sm,         // 4pt: rule → contact line
  },
  headerContact: {
    fontFamily: fonts.sans,
    fontSize:   ty.subtextSize,       // 8.5pt
    lineHeight: ty.lineHeight,
    color:      colors.muted,
  },
  headerLinks: {
    fontFamily: fonts.sans,
    fontSize:   ty.subtextSize - 0.5, // 8pt
    lineHeight: ty.lineHeight,
    color:      colors.faint,
  },

  // ── Section wrapper ───────────────────────────────────────────────────────
  section: {
    marginTop: comp.sectionGap,       // 4pt — combined with entry.marginBottom(8) = 12pt total
  },

  // ── Section heading ───────────────────────────────────────────────────────
  sectionHeadWrap: {
    marginBottom: comp.sectionBodyGap, // 4pt: rule → section body
  },
  sectionHead: {
    fontFamily:    fonts.sansBold,
    fontSize:      ty.sectionHeadingSize, // 9pt
    lineHeight:    1,
    color:         colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom:  sp.xs,             // 2pt: heading text → rule
  },
  sectionRule: {
    borderBottomWidth: 0.85,
    borderBottomColor: colors.rule,
  },

  // ── Summary ───────────────────────────────────────────────────────────────
  summaryText: {
    fontFamily: fonts.sans,
    fontSize:   ty.bodySize,
    lineHeight: 1.35,
    color:      colors.body,
    textAlign:  "justify",
  },

  // ── Entry wrapper (experience & education) ────────────────────────────────
  entry: {
    marginBottom: comp.entryGap,      // 8pt between entries
  },

  // ── Role + Date row ───────────────────────────────────────────────────────
  roleDateRow: {
    flexDirection: "row",
    alignItems:   "baseline",         // text baselines align across columns
  },
  roleCol: {
    flex:         1,
    flexShrink:   1,
    paddingRight: comp.rightColumnGap, // 8pt gap before date column
  },
  dateCol: {
    width:      comp.metaWidth,       // 90pt — fits "Feb 2024 – Present"
    flexShrink: 0,
    alignItems: "flex-end",
  },
  roleText: {
    fontFamily: fonts.sansBold,
    fontSize:   ty.roleSize,          // 10pt
    lineHeight: ty.lineHeight,
    color:      colors.ink,
  },
  dateText: {
    fontFamily: fonts.sans,
    fontSize:   ty.subtextSize,       // 8.5pt
    lineHeight: ty.lineHeight,
    color:      colors.faint,
    textAlign:  "right",
  },

  // ── Company / Location italic line ────────────────────────────────────────
  // Sits directly under the role row — no extra margin, lineHeight provides separation.
  companyLine: {
    fontFamily: fonts.sansItalic,
    fontSize:   9,
    lineHeight: ty.lineHeight,
    color:      colors.faint,
  },

  // ── Bullets container ─────────────────────────────────────────────────────
  bulletsWrap: {
    marginTop: comp.sectionBodyGap,   // 4pt: company line → first bullet
  },

  // ── Bullet row — hanging indent ───────────────────────────────────────────
  // paddingLeft = INDENT depth (14pt).
  // bulletMark: width = INDENT, marginLeft = –INDENT  →  mark hangs into indent zone.
  // bulletText: flex: 1  →  text wraps flush at the 14pt indent mark.
  bulletRow: {
    flexDirection: "row",
    alignItems:   "flex-start",
    paddingLeft:   comp.bulletIndent, // 14pt indent
    marginBottom:  comp.bulletGap,    // 2pt between bullets
  },
  bulletMark: {
    width:        comp.bulletIndent,  // 14pt
    marginLeft:  -comp.bulletIndent,  // –14pt → pull mark back into indent zone
    fontFamily:   fonts.sans,
    fontSize:     ty.bodySize,
    lineHeight:   1.3,
    color:        colors.muted,
    paddingRight: 5,
    textAlign:    "right",
  },
  bulletText: {
    flex:       1,
    fontFamily: fonts.sans,
    fontSize:   ty.bodySize,          // 9.5pt
    lineHeight: 1.3,
    color:      colors.body,
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  skillRow: {
    flexDirection: "row",
    alignItems:   "flex-start",
    marginBottom:  comp.bulletGap,    // 2pt between skill rows
  },
  skillLabel: {
    width:      comp.labelWidth,      // 115pt
    flexShrink: 0,
    fontFamily: fonts.sansBold,
    fontSize:   ty.bodySize,
    lineHeight: ty.lineHeight,
    color:      colors.ink,
  },
  skillText: {
    flex:       1,
    fontFamily: fonts.sans,
    fontSize:   ty.bodySize,
    lineHeight: ty.lineHeight,
    color:      colors.body,
  },

  // ── Education entry ───────────────────────────────────────────────────────
  eduEntry: {
    marginBottom: comp.entryGap,      // 8pt between edu entries
  },
  eduDegree: {
    fontFamily: fonts.sansBold,
    fontSize:   ty.bodySize,
    lineHeight: ty.lineHeight,
    color:      colors.ink,
  },
  eduSchoolLine: {
    fontFamily: fonts.sansItalic,
    fontSize:   9,
    lineHeight: ty.lineHeight,
    color:      colors.faint,
  },
  eduDetailsWrap: {
    marginTop: sp.xs,
  },

  // ── Kept for backward compatibility with any un-migrated callers ──────────
  sectionHeadingWrap:  { marginBottom: comp.sectionBodyGap },
  sectionHeading:      { fontFamily: fonts.sansBold, fontSize: ty.sectionHeadingSize, lineHeight: 1, color: colors.accent, textTransform: "uppercase", letterSpacing: 1.1, marginBottom: sp.xs },
  sectionHeadingRule:  { borderBottomWidth: 0.85, borderBottomColor: colors.rule },
  sectionBody:         { marginTop: 0 },
  entryRole:           { fontFamily: fonts.sansBold, fontSize: ty.roleSize, lineHeight: ty.lineHeight, color: colors.ink },
  entryDate:           { fontFamily: fonts.sans, fontSize: ty.subtextSize, lineHeight: ty.lineHeight, color: colors.faint, textAlign: "right" },
  entryCompany:        { fontFamily: fonts.sansItalic, fontSize: 9, lineHeight: ty.lineHeight, color: colors.faint },
  entryCompanyLine:    { fontFamily: fonts.sansItalic, fontSize: 9, lineHeight: ty.lineHeight, color: colors.faint },
  entryRow:            { flexDirection: "row", alignItems: "baseline" },
  entryLeft:           { flex: 1, flexShrink: 1, paddingRight: comp.rightColumnGap },
  entryRight:          { width: comp.metaWidth, flexShrink: 0, alignItems: "flex-end" },
  entryHeader:         { marginBottom: 0 },
  entryBody:           { marginTop: comp.sectionBodyGap },
  summary:             { fontFamily: fonts.sans, fontSize: ty.bodySize, lineHeight: 1.35, color: colors.body, textAlign: "justify" },
  educationDetails:    { marginTop: sp.xs },
  certificateLine:     { marginTop: 0 },
  sectionSpacer:       { height: sp.sm },
  denseSpacer:         { height: sp.xs },
  emptySpace:          { height: sp.md },
  skillBody:           { flex: 1, fontFamily: fonts.sans, fontSize: ty.bodySize, lineHeight: ty.lineHeight, color: colors.body },
  bulletBody:          { flex: 1, fontFamily: fonts.sans, fontSize: ty.bodySize, lineHeight: 1.3, color: colors.body },
});
