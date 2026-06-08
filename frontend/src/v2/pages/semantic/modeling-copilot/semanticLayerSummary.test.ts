import { describe, expect, it } from "vitest";
import { extractSemanticLayerSummary } from "./semanticLayerSummary";

describe("extractSemanticLayerSummary", () => {
  it("从 raw_spec 提取 Cube 层和轻本体锚定摘要", () => {
    const summary = extractSemanticLayerSummary({
      rawSpec: {
        cube: {
          name: "student_comment_cube",
          source: "public.dwd_student_comment",
          dimensions: {
            school_id: { title: "学校" },
            published_at: { title: "发布时间" },
          },
          measures: {
            comment_count: { title: "评论数" },
          },
        },
        ontology: {
          object: { name: "student_comment", title: "学生评论" },
          metrics: [
            {
              name: "student_comment_count",
              title: "学生评论数",
              measure_refs: ["student_comment_cube.comment_count"],
            },
          ],
        },
      },
    });

    expect(summary.cube.name).toBe("student_comment_cube");
    expect(summary.cube.source).toBe("public.dwd_student_comment");
    expect(summary.cube.dimensionCount).toBe(2);
    expect(summary.cube.measureCount).toBe(1);
    expect(summary.ontology.objectName).toBe("学生评论");
    expect(summary.ontology.metricNames).toEqual(["学生评论数"]);
    expect(summary.bindingCount).toBe(1);
  });

  it("从 semantic_canvas 补齐轻本体对象、指标和 bindings", () => {
    const summary = extractSemanticLayerSummary({
      rawSpec: {
        cube: {
          name: "course_activity_cube",
          table: "mart.course_activity",
          dimensions: [{ name: "class_id" }],
          measures: [{ name: "active_student_count" }],
        },
      },
      semanticCanvas: {
        objects: [{ name: "class_activity", title: "班级活跃度" }],
        metrics: [{ name: "active_student_count", title: "活跃学生数" }],
        bindings: [
          {
            metric: "active_student_count",
            measure_ref: "course_activity_cube.active_student_count",
          },
          {
            metric: "activity_rate",
            measure_ref: "course_activity_cube.activity_rate",
          },
        ],
      },
    });

    expect(summary.cube.source).toBe("mart.course_activity");
    expect(summary.cube.dimensionCount).toBe(1);
    expect(summary.cube.measureCount).toBe(1);
    expect(summary.ontology.objectName).toBe("班级活跃度");
    expect(summary.ontology.metricNames).toEqual(["活跃学生数"]);
    expect(summary.bindingCount).toBe(2);
  });

  it("支持后端会话 snake_case 的 raw_spec 和 semantic_canvas 摘要", () => {
    const summary = extractSemanticLayerSummary({
      raw_spec: {
        cube: {
          name: "lesson_progress_cube",
          source: "mart.lesson_progress",
          dimensions: {
            lesson_id: { title: "课程" },
            school_id: { title: "学校" },
          },
          measures: {
            completed_student_count: { title: "完课学生数" },
            completion_rate: { title: "完课率" },
          },
        },
        ontology: {
          object: { name: "lesson_progress", title: "课程进度" },
          metrics: [
            {
              name: "completed_student_count",
              title: "完课学生数",
              measure_refs: ["lesson_progress_cube.completed_student_count"],
            },
          ],
        },
      },
      semantic_canvas: {
        objects: [{ name: "fallback_object", title: "备用对象" }],
        metrics: [{ name: "completion_rate", title: "完课率" }],
        bindings: [
          {
            metric: "completed_student_count",
            measure_ref: "lesson_progress_cube.completed_student_count",
          },
          {
            metric: "completion_rate",
            cube_measure: "lesson_progress_cube.completion_rate",
          },
        ],
      },
    });

    expect(summary.cube.name).toBe("lesson_progress_cube");
    expect(summary.cube.source).toBe("mart.lesson_progress");
    expect(summary.cube.dimensionCount).toBe(2);
    expect(summary.cube.measureCount).toBe(2);
    expect(summary.ontology.objectName).toBe("课程进度");
    expect(summary.ontology.metricNames).toEqual(["完课学生数"]);
    expect(summary.bindingCount).toBe(2);
  });

  it("空输入返回待补齐状态", () => {
    const summary = extractSemanticLayerSummary({});

    expect(summary.cube.status).toBe("missing");
    expect(summary.ontology.status).toBe("missing");
    expect(summary.bindingCount).toBe(0);
  });
});
