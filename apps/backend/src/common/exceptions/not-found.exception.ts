import { NotFoundException } from "@nestjs/common";

export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, identifier?: string | number) {
    super(
      identifier === undefined
        ? `${resource} not found`
        : `${resource} with id ${identifier} not found`,
    );
  }
}
