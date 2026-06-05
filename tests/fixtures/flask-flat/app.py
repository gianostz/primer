from flask import Flask, jsonify, request, abort

app = Flask(__name__)

tasks = [
    {"id": 1, "title": "first task", "done": False},
]


@app.route("/tasks", methods=["GET"])
def get_tasks():
    return jsonify(tasks)


@app.route("/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    for task in tasks:
        if task["id"] == task_id:
            return jsonify(task)
    abort(404)


@app.route("/tasks", methods=["POST"])
def create_task():
    body = request.get_json(silent=True) or {}
    if "title" not in body:
        abort(400)
    task = {"id": len(tasks) + 1, "title": body["title"], "done": False}
    tasks.append(task)
    return jsonify(task), 201


@app.route("/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    body = request.get_json(silent=True) or {}
    for task in tasks:
        if task["id"] == task_id:
            task["title"] = body.get("title", task["title"])
            task["done"] = body.get("done", task["done"])
            return jsonify(task)
    abort(404)


@app.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    global tasks
    for task in tasks:
        if task["id"] == task_id:
            tasks = [t for t in tasks if t["id"] != task_id]
            return "", 204
    abort(404)


if __name__ == "__main__":
    app.run(debug=True)
