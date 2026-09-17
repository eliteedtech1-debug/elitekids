# NERDC Age Band Rename Progress

**Task:** Q44 - Update age band names from old to new NERDC standards  
**Agent:** opencode/mimo-v2.5-free  
**Start:** 2026-09-08T00:00:00Z  
**End:** 2026-09-08T00:00:00Z  

## Status: DONE

## Files Updated

### Frontend (8 files)
1. `frontend/src/lib/utils/constants.ts` - AGE_LEVELS array
2. `frontend/src/lib/utils/accessibility.ts` - AGE_LEVEL_COLORS map
3. `frontend/src/components/PlacementQuiz.tsx` - BAND_EMOJI, BAND_LABEL, BAND_SPEAK maps
4. `frontend/src/pages/Teacher/TeacherLessons.tsx` - AGE_COLORS map, default age_level, select options
5. `frontend/src/pages/Teacher/GameCreator.tsx` - minAge values, default ageLevel
6. `frontend/src/pages/Teacher/Marketplace.tsx` - default age_band, select options
7. `frontend/src/pages/Student/GamePlay.tsx` - difficulty logic comparisons
8. `frontend/src/pages/Parent/ParentChildren.tsx` - default age_level

### Backend (9 files)
9. `backend/src/controllers/kids.js` - AGE_LEVELS array, default values
10. `backend/src/controllers/kidsCurriculum.js` - AGE_BANDS array
11. `backend/src/controllers/kidsPlacement.js` - ENUM type, default band
12. `backend/src/controllers/e3fWeekend.js` - hardcoded KG2 references
13. `backend/src/services/teamFormation.js` - AXLE_BANDS array
14. `backend/src/media/puzzle-splitter.js` - minAge values
15. `backend/src/models/KidChild.js` - ENUM type, defaultValue
16. `backend/src/models/KidLesson.js` - ENUM type
17. `backend/src/controllers/kidsGoals.js` - Creche reference

## Mapping

| Old | New |
|-----|-----|
| Creche | Crèche |
| Nursery | Playgroup |
| KG1 | Nursery 1 |
| KG2 | Nursery 2 |
| (none) | Kindergarten |
| Primary | Primary |

## Notes

- All changes are consistent across frontend and backend
- Database ENUM types updated in model definitions
- Default values updated to use new band names
- UI components now display new band names