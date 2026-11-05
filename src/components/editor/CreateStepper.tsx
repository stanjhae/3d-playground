import { StepHeader } from '../ui/StepHeader'
import { CREATE_STEPS } from '../../lib/create-steps'
import { useEditorStore } from '../../lib/editor-store'

export function CreateStepper() {
  const createStep = useEditorStore((state) => state.createStep)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)

  return (
    <StepHeader
      label="Create steps"
      steps={CREATE_STEPS}
      current={createStep}
      onSelect={(id) => {
        setCreateStep({ createStep: id })
      }}
      className="w-full"
    />
  )
}
