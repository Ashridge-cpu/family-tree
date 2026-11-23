Mark Turner – direct-line ancestry import
========================================

File: mark-direct-line-ancestry-2026-11-23.ged
Source: Ancestry "Turner Family Tree" 169957621, read 23 Nov 2026,
plus Leonard Lesley Turner (born 30 Jan 1934) as Robert's brother
from Mark's family report. No unsourced names, dates, places or
siblings were added. Conflicts are recorded as notes, not resolved.

How to import into the live tree (does not wipe existing people)
---------------------------------------------------------------
1. Download a backup first: open the family tree, tap More, then
   "Download full backup (with photos & documents)". Keep that file.

2. Still in More, tap "Import GEDCOM (.ged) from Ancestry,
   FamilySearch…". Choose this .ged file.

3. The preview lists people who already look like they are on the
   tree (same name and birth year). Leave Mark, Robert and Jean
   (and Leonard, if he is already there) set to "Same person – link".
   Only use "Different – add new" if it really is someone else.
   Then tap Import.

4. Nothing already in the tree is deleted. Existing photos, notes
   and dates are kept. Blank dates and places are filled in, new
   relatives are joined on, and conflict or uncertainty notes are
   added to the person (and shown in a gold box on their details).

5. Refresh if the tree does not update at once. Check Robert and
   Jean for the wedding-date conflict, Fredrick Farr for the 1923
   marriage / 1920 death conflict, and May Stokes for the uncertain
   father. Check that Leonard sits as Robert's brother, and that
   Jean's five siblings are there.

Jean's siblings are imported with the names and years given in the
source (Thomas Albert, Beryl, Derrick Charles, Kathleen, Vera) and
without a surname, because none was listed. If you have already
added any of them under a surname such as Farr, choose Skip for
that person in the preview, or remove a duplicate afterwards.

If cloud sync still shows as "not switched on yet", publish the
Firebase rules from:

  https://ashridge-cpu.github.io/family-tree/firestore-rules.txt

into the Firebase console, as already documented for the app.
