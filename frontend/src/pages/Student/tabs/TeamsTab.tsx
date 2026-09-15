import { Users } from 'lucide-react';
import ClassQuest from '@/components/ClassQuest';
import TeamChallenge from '@/components/TeamChallenge';
import PeerTeachingBoard from '@/components/PeerTeachingBoard';
import type { StudentData } from './types';

interface TeamsTabProps {
  student: StudentData | null;
}

export default function TeamsTab({ student }: TeamsTabProps) {
  return (
    <div className="space-y-5 animate-game-slide-up">
      {student?.class_code && (
        <ClassQuest
          classId={String(student.class_code)}
          childAdmissionNo={String(student.admission_no || student.id || '')}
        />
      )}
      {student?.team_id && (
        <TeamChallenge
          teamId={Number(student.team_id)}
          classId={String(student.class_code)}
          childAdmissionNo={String(student.admission_no || student.id || '')}
        />
      )}
      {student?.class_code && (
        <PeerTeachingBoard
          classId={String(student.class_code)}
          childAdmissionNo={String(student.admission_no || student.id || '')}
        />
      )}
    </div>
  );
}
