# NERDC Age Band Rename Summary

**Date:** 2026-09-08  
**Agent:** opencode/mimo-v2.5-free  
**Task:** Update age band names from old to new NERDC standards

## Changes Made

### Frontend Files

1. **`frontend/src/lib/utils/constants.ts`**
   - Updated `AGE_LEVELS` array from `['Creche', 'Nursery', 'KG1', 'KG2', 'Primary']` to `['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary']`

2. **`frontend/src/lib/utils/accessibility.ts`**
   - Updated `AGE_LEVEL_COLORS` map keys and colors:
     - `Crèche`: `bg-pink-100 text-pink-700`
     - `Playgroup`: `bg-orange-100 text-orange-700`
     - `Nursery 1`: `bg-purple-100 text-purple-700`
     - `Nursery 2`: `bg-blue-100 text-blue-700`
     - `Kindergarten`: `bg-indigo-100 text-indigo-700`
     - `Primary`: `bg-green-100 text-green-700`

3. **`frontend/src/components/PlacementQuiz.tsx`**
   - Updated `BAND_EMOJI` map: Added `Kindergarten: '🎓'`, updated other keys
   - Updated `BAND_LABEL` map: All labels now match new band names
   - Updated `BAND_SPEAK` map: All spoken forms now match new band names

4. **`frontend/src/pages/Teacher/TeacherLessons.tsx`**
   - Updated `AGE_COLORS` map keys to new band names
   - Changed default `age_level` from `'KG1'` to `'Nursery 1'`
   - Updated select options to use new band values

5. **`frontend/src/pages/Teacher/GameCreator.tsx`**
   - Updated `minAge` values in puzzle-split template:
     - `'Creche'` → `'Crèche'`
     - `'Nursery'` → `'Playgroup'`
     - `'KG1'` → `'Nursery 1'`
     - `'KG2'` → `'Nursery 2'`
   - Changed default `ageLevel` from `'KG1'` to `'Nursery 1'` (2 occurrences)

6. **`frontend/src/pages/Teacher/Marketplace.tsx`**
   - Changed default `age_band` from `'KG1'` to `'Nursery 1'` (2 occurrences)
   - Updated select options to use new band values

7. **`frontend/src/pages/Student/GamePlay.tsx`**
   - Updated difficulty logic comparisons:
     - `age === 'Creche' || age === 'Nursery'` → `age === 'Crèche' || age === 'Playgroup' || age === 'Nursery 1'`
     - `age === 'KG1'` → `age === 'Nursery 1'`
     - `age === 'KG2'` → `age === 'Nursery 2'`
   - Changed default from `'KG1'` to `'Nursery 1'`

8. **`frontend/src/pages/Parent/ParentChildren.tsx`**
   - Changed default `age_level` from `'Creche'` to `'Crèche'` (3 occurrences)
   - Select options already updated to new band names

### Backend Files

9. **`backend/src/controllers/kids.js`**
   - Updated `AGE_LEVELS` array from `['Creche', 'Nursery', 'KG1', 'KG2', 'Primary']` to `['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary']`
   - Updated default values:
     - `'Nursery'` → `'Nursery 1'` (2 occurrences)
     - `'Creche'` → `'Crèche'` (1 occurrence)

10. **`backend/src/controllers/kidsCurriculum.js`**
    - Updated `AGE_BANDS` array from `['Creche', 'Nursery', 'KG1', 'KG2', 'Primary']` to `['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary']`

11. **`backend/src/controllers/kidsPlacement.js`**
    - Updated `ENUM` type in SQL from `('Creche','Nursery','KG1','KG2','Primary')` to `('Crèche','Playgroup','Nursery 1','Nursery 2','Kindergarten','Primary')`
    - Changed default band from `'KG2'` to `'Nursery 2'`

12. **`backend/src/controllers/e3fWeekend.js`**
    - Updated hardcoded `'KG2'` to `'Nursery 2'` (3 occurrences)

13. **`backend/src/services/teamFormation.js`**
    - Updated `AXLE_BANDS` from `['Creche', 'Nursery', 'KG1', 'KG2', 'Primary']` to `['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary']`

14. **`backend/src/media/puzzle-splitter.js`**
    - Updated `minAge` values in `DIFFICULTY_LEVELS`:
      - `'Creche'` → `'Crèche'`
      - `'Nursery'` → `'Playgroup'`
      - `'KG1'` → `'Nursery 1'`
      - `'KG2'` → `'Nursery 2'`

15. **`backend/src/models/KidChild.js`**
    - Updated `ENUM` type from `('Creche', 'Nursery', 'KG1', 'KG2', 'Primary')` to `('Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary')`
    - Updated `defaultValue` from `'Nursery'` to `'Nursery 1'`

16. **`backend/src/models/KidLesson.js`**
    - Updated `ENUM` type from `('Creche', 'Nursery', 'KG1', 'KG2', 'Primary')` to `('Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary')`

17. **`backend/src/controllers/kidsGoals.js`**
    - Updated `'Creche'` reference to `'Crèche'`

## Old → New Mapping

| Old Name | New Name |
|----------|----------|
| Creche | Crèche |
| Nursery | Playgroup |
| KG1 | Nursery 1 |
| KG2 | Nursery 2 |
| (none) | Kindergarten |
| Primary | Primary |

## Notes

- All frontend and backend files have been updated to use the new NERDC age band names
- The mapping is consistent across the entire codebase
- Database ENUM types have been updated in model definitions
- Default values have been updated to use new band names
- Select options and UI components now display the new band names