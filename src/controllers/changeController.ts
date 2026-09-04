/**
 * @file src/controllers/changeController.ts
 * @module controllers/changeController
 * @description ITIL Change Management controller governing release and change requests.
 *
 * Architectural Role:
 * Orchestrates ITIL Change Enablement workflows to minimize release risks and
 * maintain infrastructure stability. Enforces change request lifecycles
 * (`DRAFT` -> `PENDING` -> `APPROVED` / `REJECTED` -> `IMPLEMENTED`), tracks
 * scheduled execution windows, and links related application tickets.
 *
 * Inputs:
 * - Express `Request` containing change descriptors, risk tiers, and schedules.
 * - Express `Response` for transmitting JSON responses.
 *
 * Outputs:
 * - Emits HTTP 201 JSON on change record creation, and HTTP 200 on status changes
 *   and application ticket associations.
 *
 * Constraints & Assumptions:
 * - State transitions are validated strictly against `CHANGE_WORKFLOW`.
 * - Approval transitions capture the approving actor (`approvedBy`).
 * - Linking an application sets `changeRequestId` on the target Application row.
 */

import { Request, Response } from 'express';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

/**
 * Directed state transition graph for ITIL Change Requests.
 *
 * Governs transition paths:
 * - `DRAFT` requests are submitted into `PENDING` review.
 * - `PENDING` requests are either `APPROVED` by authorized leads or `REJECTED`.
 * - `APPROVED` requests proceed to final execution as `IMPLEMENTED`.
 */
const CHANGE_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED'],
  IMPLEMENTED: [],
  REJECTED: [],
};

/**
 * Creates a new ITIL Change Request in DRAFT status.
 *
 * @param request - Express request containing title, description, change type,
 *   risk classification, scheduled window, and requesting user.
 * @param response - Express response returning the created Change Request with HTTP 201.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const createChange = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { title, description, type, risk, scheduledAt, requestedBy } =
    request.body;

  try {
    const createdChange = await db.orm.public.ChangeRequest.create({
      title,
      description,
      type,
      risk,
      scheduledAt: new Date(scheduledAt).toISOString(),
      requestedBy: requestedBy || 'System',
    });
    response.status(201).json(createdChange);
  } catch {
    const createdChange = localStore.createChange({
      title,
      description,
      type,
      risk,
      scheduledAt: new Date(scheduledAt).toISOString(),
      requestedBy: requestedBy || 'System',
    });
    response.status(201).json(createdChange);
  }
};

/**
 * Retrieves all Change Requests ordered chronologically by scheduled deployment window.
 *
 * Includes associated application records to show scope of impacted tickets.
 *
 * @param _request - Express request object (unused).
 * @param response - Express response returning an array of Change Requests.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const getChanges = async (
  _request: Request,
  response: Response,
): Promise<void> => {
  try {
    const changes = await db.orm.public.ChangeRequest
      .orderBy((change) => change.scheduledAt.asc())
      .include('applications')
      .all();
    response.status(200).json(changes);
  } catch {
    const changes = localStore.getChanges();
    response.status(200).json(changes);
  }
};

/**
 * Updates the lifecycle status of an ITIL Change Request following `CHANGE_WORKFLOW`.
 *
 * Captures approver identity whenever transitioning into `APPROVED` status.
 *
 * @param request - Express request containing change `id` parameter and target status.
 * @param response - Express response returning the updated Change Request.
 * @throws {NotFoundError} If the targeted change record does not exist.
 * @throws {ValidationError} If the requested status change is not allowed.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const updateChangeStatus = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const changeId = request.params.id as string;
  const { status, approvedBy } = request.body;

  try {
    const updatedChange = await db.transaction(async (transaction) => {
      const currentChange = await transaction.orm.public.ChangeRequest
        .where({ id: changeId })
        .first();

      if (!currentChange) {
        throw new NotFoundError('Change request not found');
      }

      const permittedStatuses = CHANGE_WORKFLOW[currentChange.status] || [];
      if (!permittedStatuses.includes(status)) {
        throw new ValidationError(
          `Недопустимий перехід: ${currentChange.status} → ${status}`,
        );
      }

      const updateData: { status: string; approvedBy?: string } = { status };
      if (status === 'APPROVED') {
        updateData.approvedBy = approvedBy || 'System';
      }

      return transaction.orm.public.ChangeRequest
        .where({ id: changeId })
        .update(updateData);
    });

    response.status(200).json(updatedChange);
  } catch (caughtError: any) {
    if (
      caughtError instanceof NotFoundError ||
      caughtError instanceof ValidationError
    ) {
      throw caughtError;
    }

    const currentChange = localStore
      .getChanges()
      .find((change) => change.id === changeId);

    if (!currentChange) {
      throw new NotFoundError('Change request not found');
    }

    const permittedStatuses = CHANGE_WORKFLOW[currentChange.status] || [];
    if (!permittedStatuses.includes(status)) {
      throw new ValidationError(
        `Недопустимий перехід: ${currentChange.status} → ${status}`,
      );
    }

    const updateData: { status: string; approvedBy?: string } = { status };
    if (status === 'APPROVED') {
      updateData.approvedBy = approvedBy || 'System';
    }

    const updatedChange = localStore.updateChange(changeId, updateData);
    response.status(200).json(updatedChange);
  }
};

/**
 * Associates an existing application ticket with a Change Request.
 *
 * Updates the `changeRequestId` foreign key on the targeted application.
 *
 * @param request - Express request containing change `id` parameter and `applicationId`.
 * @param response - Express response returning the updated application record.
 * @throws {NotFoundError} If the targeted application record is not found.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const linkApplication = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const changeId = request.params.id as string;
  const { applicationId } = request.body;

  try {
    const updatedApplication = await db.orm.public.Application
      .where({ id: applicationId })
      .update({
        changeRequestId: changeId,
      });

    if (!updatedApplication) {
      throw new NotFoundError('Application not found');
    }
    response.status(200).json(updatedApplication);
  } catch {
    const updatedApplication = localStore.updateApplication(applicationId, {
      changeRequestId: changeId,
    });

    if (!updatedApplication) {
      throw new NotFoundError('Application not found');
    }
    response.status(200).json(updatedApplication);
  }
};
