/**
 * @file src/controllers/problemController.ts
 * @module controllers/problemController
 * @description ITIL Problem Management controller managing root cause analysis and workarounds.
 *
 * Architectural Role:
 * Handles operations related to recurring IT incidents and known errors.
 * Enforces the ITIL Problem lifecycle state machine (`NEW` -> `RCA` ->
 * `KNOWN_ERROR` -> `RESOLVED`), tracking root causes and permanent workarounds
 * to prevent incident reoccurrence across the organization.
 *
 * Inputs:
 * - Express `Request` containing problem payloads, status updates, and route params.
 * - Express `Response` for transmitting JSON results.
 *
 * Outputs:
 * - Emits HTTP 201 JSON on record creation, and HTTP 200 on retrieval and state mutation.
 *
 * Constraints & Assumptions:
 * - Status transitions must strictly follow `PROBLEM_WORKFLOW` directed acyclic transitions.
 * - Illegal transitions trigger a localized Ukrainian `ValidationError`.
 * - In offline or testing environments, falls back seamlessly to `localStore`.
 */

import { Request, Response } from 'express';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

/**
 * Directed state transition graph for ITIL Problem lifecycles.
 *
 * Ensures problems transition through structured investigation phases:
 * initial identification (`NEW`), root cause analysis (`RCA`), published
 * workaround (`KNOWN_ERROR`), and final permanent closure (`RESOLVED`).
 */
const PROBLEM_WORKFLOW: Record<string, string[]> = {
  NEW: ['RCA'],
  RCA: ['KNOWN_ERROR'],
  KNOWN_ERROR: ['RESOLVED'],
  RESOLVED: [],
};

/**
 * Creates a new ITIL Problem investigation ticket.
 *
 * @param request - Express request containing `title` and `description`.
 * @param response - Express response returning the created Problem record with HTTP 201.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const createProblem = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { title, description } = request.body;

  try {
    const createdProblem = await db.orm.public.Problem.create({
      title,
      description,
    });
    response.status(201).json(createdProblem);
  } catch {
    // Fallback path for testing or disconnected database instances.
    const createdProblem = localStore.createProblem({ title, description });
    response.status(201).json(createdProblem);
  }
};

/**
 * Retrieves all ITIL Problem records ordered by creation timestamp descending.
 *
 * Includes linked application tickets to provide incident correlation context.
 *
 * @param _request - Express request object (unused).
 * @param response - Express response returning an array of Problem records.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const getProblems = async (
  _request: Request,
  response: Response,
): Promise<void> => {
  try {
    const problems = await db.orm.public.Problem
      .orderBy((problem) => problem.createdAt.desc())
      .include('applications')
      .all();
    response.status(200).json(problems);
  } catch {
    const problems = localStore.getProblems();
    response.status(200).json(problems);
  }
};

/**
 * Updates the lifecycle status, root cause analysis, or workaround for an ITIL Problem.
 *
 * Validates that the requested status change conforms to `PROBLEM_WORKFLOW`.
 *
 * @param request - Express request containing problem `id` parameter and update body.
 * @param response - Express response returning the updated Problem record.
 * @throws {NotFoundError} If the targeted problem record does not exist.
 * @throws {ValidationError} If the requested status transition is not permitted.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const updateProblemStatus = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const problemId = request.params.id as string;
  const { status, rootCause, workaround } = request.body;

  try {
    const updatedRecord = await db.transaction(async (transaction) => {
      const currentProblem = await transaction.orm.public.Problem
        .where({ id: problemId })
        .first();

      if (!currentProblem) {
        throw new NotFoundError('Problem record not found');
      }

      const permittedStatuses = PROBLEM_WORKFLOW[currentProblem.status] || [];
      if (!permittedStatuses.includes(status)) {
        throw new ValidationError(
          `Недопустимий перехід: ${currentProblem.status} → ${status}`,
        );
      }

      const updatePayload: {
        status: string;
        rootCause?: string;
        workaround?: string;
      } = { status };

      if (rootCause) {
        updatePayload.rootCause = rootCause;
      }
      if (workaround) {
        updatePayload.workaround = workaround;
      }

      return transaction.orm.public.Problem
        .where({ id: problemId })
        .update(updatePayload);
    });

    response.status(200).json(updatedRecord);
  } catch (caughtError: any) {
    // Re-throw domain validation and not-found exceptions directly.
    if (
      caughtError instanceof NotFoundError ||
      caughtError instanceof ValidationError
    ) {
      throw caughtError;
    }

    // Fallback logic executing within localStore memory space.
    const currentProblem = localStore
      .getProblems()
      .find((problem) => problem.id === problemId);

    if (!currentProblem) {
      throw new NotFoundError('Problem record not found');
    }

    const permittedStatuses = PROBLEM_WORKFLOW[currentProblem.status] || [];
    if (!permittedStatuses.includes(status)) {
      throw new ValidationError(
        `Недопустимий перехід: ${currentProblem.status} → ${status}`,
      );
    }

    const updatePayload: {
      status: string;
      rootCause?: string;
      workaround?: string;
    } = { status };

    if (rootCause) {
      updatePayload.rootCause = rootCause;
    }
    if (workaround) {
      updatePayload.workaround = workaround;
    }

    const updatedProblem = localStore.updateProblem(problemId, updatePayload);
    response.status(200).json(updatedProblem);
  }
};
